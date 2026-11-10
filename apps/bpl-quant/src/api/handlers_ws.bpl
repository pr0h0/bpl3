# WebSocket market-data push feed (bpl-websocket).
#
#   GET /ws/feed                     JSON push session
#   GET /ws/feed?format=itch&events= binary ITCH packets of a generated feed
#
# JSON session: the server greets with {"type":"hello"}, then the client
# sends commands as text messages:
#   {"op":"subscribe","symbol":"ACME"}   start pushing that symbol
#   {"op":"unsubscribe","symbol":"ACME"}
#   {"op":"sim","events":500,"seed":7}  run order flow on the subscriptions
#   {"op":"snapshot"}                    depth snapshot of every subscription
#   {"op":"ping"}                        answered with {"type":"pong"}
#   {"op":"close"}
# After every command the server pushes new trades and changed books for
# the subscribed symbols; idle sessions get a heartbeat after each read
# timeout. The connection holds a worker process for its lifetime.

import [Request], [Response] from "bpl-express";
import [WebSocket], [WsMessage], [WsKind] from "bpl-websocket";
import [JsonWriter] from "../core/json_writer.bpl";
import [JsonDoc], [JsonKind] from "../core/json_doc.bpl";
import [Text] from "../core/text.bpl";
import [AppState], appState from "./state.bpl";
import [Reply] from "./respond.bpl";
import [Params] from "./params.bpl";
import [Engine] from "../market/engine.bpl";
import [Trade], [Ticks], [Side] from "../market/order.bpl";
import [OrderBook], [DepthLevel] from "../market/book.bpl";
import [FlowSimulator], [SimSummary] from "../market/simulator.bpl";
import [FeedPublisher] from "../proto/feed.bpl";
import [FeedSim] from "../proto/feed_sim.bpl";
import [MoldPacket] from "../proto/itch.bpl";

export wsFeedHandler;

struct FeedSession {
    socket: *WebSocket,
    subscribed: bool[64],
    last_trade_id: long,
    last_book_seq: long[64],
    sent: long,
    heartbeats: long,
}

frame sendJson(fs: *FeedSession, w: *JsonWriter) ret bool {
    fs.sent = fs.sent + 1;
    return fs.socket.sendText(w.toString());
}

frame sendError(fs: *FeedSession, message: string) ret bool {
    local w: JsonWriter = JsonWriter.new(128);
    w.beginObject().fieldStr("type", "error").fieldStr("message", message).endObject();
    local ok: bool = sendJson(fs, &w);
    w.destroy();
    return ok;
}

frame writeSide(w: *JsonWriter, b: *OrderBook, buy: bool, depth: int) {
    local levels: DepthLevel[10];
    local n: int = b.depth(buy ? Side.Buy : Side.Sell, &levels[0], depth);
    w.key(buy ? "bids" : "asks").beginArray();
    loop (local i: int = 0; i < n; i = i + 1) {
        w.beginArray();
        w.num(Ticks.toFloat(levels[i].price));
        w.integer(levels[i].quantity);
        w.integer(cast<long>(levels[i].orders));
        w.endArray();
    }
    w.endArray();
}

frame sendBook(fs: *FeedSession, e: *Engine, symbol: int) ret bool {
    local b: *OrderBook = e.book(symbol);
    local w: JsonWriter = JsonWriter.new(1024);
    w.beginObject();
    w.fieldStr("type", "book");
    w.fieldStr("symbol", e.symbolName(symbol));
    w.fieldInt("seq", e.sequence);
    writeSide(&w, b, true, 5);
    writeSide(&w, b, false, 5);
    if (b.last_price > 0) {
        w.fieldNum("last", Ticks.toFloat(b.last_price));
    }
    w.fieldInt("volume", b.volume);
    w.endObject();
    local ok: bool = sendJson(fs, &w);
    w.destroy();
    fs.last_book_seq[symbol] = e.sequence;
    return ok;
}

# Pushes trades newer than the last one sent (subscribed symbols only),
# at most 500 per message, then the books that changed.
frame pushUpdates(fs: *FeedSession, e: *Engine) ret bool {
    local n: int = e.tape.count;
    local first: int = n;
    loop ((first > 0) && (e.tape.at(first - 1).id > fs.last_trade_id)) {
        first = first - 1;
    }
    local changed: bool[64];
    loop (local s: int = 0; s < 64; s = s + 1) {
        changed[s] = false;
    }
    local i: int = first;
    loop (i < n) {
        local w: JsonWriter = JsonWriter.new(4096);
        w.beginObject();
        w.fieldStr("type", "trades");
        w.key("trades").beginArray();
        local batch: int = 0;
        loop ((i < n) && (batch < 500)) {
            local t: *Trade = e.tape.at(i);
            if ((t.symbol < 64) && fs.subscribed[t.symbol]) {
                w.beginObject();
                w.fieldInt("id", t.id);
                w.fieldStr("symbol", e.symbolName(t.symbol));
                w.fieldNum("price", Ticks.toFloat(t.price));
                w.fieldInt("qty", t.quantity);
                w.fieldStr("side", Ticks.sideName(t.aggressor));
                w.endObject();
                batch = batch + 1;
                changed[t.symbol] = true;
            }
            fs.last_trade_id = t.id;
            i = i + 1;
        }
        w.endArray();
        w.fieldInt("count", cast<long>(batch));
        w.endObject();
        local ok: bool = batch == 0 ? true : sendJson(fs, &w);
        w.destroy();
        if (!ok) {
            return false;
        }
    }
    loop (local s: int = 0; (s < e.book_count) && (s < 64); s = s + 1) {
        if (fs.subscribed[s] && (changed[s] || (fs.last_book_seq[s] != e.sequence))) {
            if (!sendBook(fs, e, s)) {
                return false;
            }
        }
    }
    return true;
}

frame hello(fs: *FeedSession, e: *Engine) ret bool {
    local w: JsonWriter = JsonWriter.new(512);
    w.beginObject();
    w.fieldStr("type", "hello");
    w.key("symbols").beginArray();
    loop (local s: int = 0; s < e.book_count; s = s + 1) {
        w.str(e.symbolName(s));
    }
    w.endArray();
    w.key("commands").beginArray();
    w.str("subscribe").str("unsubscribe").str("sim").str("snapshot").str("ping").str("close");
    w.endArray();
    w.endObject();
    local ok: bool = sendJson(fs, &w);
    w.destroy();
    return ok;
}

# Handles one command; returns false to end the session.
frame command(fs: *FeedSession, e: *Engine, text: string) ret bool {
    local doc: JsonDoc = JsonDoc.parse(text);
    local owner: *JsonDoc = &doc;
    defer owner.destroy();
    if (!doc.ok() || !doc.isKind(doc.root(), JsonKind.Object)) {
        return sendError(fs, "commands are JSON objects");
    }
    local root: int = doc.root();
    local op: string = doc.getStr(root, "op");
    if (op == nullptr) {
        return sendError(fs, "missing op");
    }
    if (Text.equals(op, "close")) {
        fs.socket.close(1000, "bye");
        return false;
    }
    if (Text.equals(op, "ping")) {
        local w: JsonWriter = JsonWriter.new(64);
        w.beginObject().fieldStr("type", "pong").fieldInt("sent", fs.sent).endObject();
        local ok: bool = sendJson(fs, &w);
        w.destroy();
        return ok;
    }
    if (Text.equals(op, "subscribe") || Text.equals(op, "unsubscribe")) {
        local name: string = doc.getStr(root, "symbol");
        local id: int = name == nullptr ? -1 : e.symbolId(name);
        if ((id < 0) || (id >= 64)) {
            return sendError(fs, "unknown symbol");
        }
        local on: bool = Text.equals(op, "subscribe");
        fs.subscribed[id] = on;
        if (on) {
            return sendBook(fs, e, id);
        }
        return true;
    }
    if (Text.equals(op, "snapshot")) {
        loop (local s: int = 0; (s < e.book_count) && (s < 64); s = s + 1) {
            if (fs.subscribed[s] && !sendBook(fs, e, s)) {
                return false;
            }
        }
        return true;
    }
    if (Text.equals(op, "sim")) {
        local events: float = doc.getNum(root, "events", 500.0);
        if (!(events >= 1.0) || (events > 50000.0)) {
            return sendError(fs, "events must be 1-50000");
        }
        local seed: float = doc.getNum(root, "seed", 1.0);
        local ran: int = 0;
        loop (local s: int = 0; (s < e.book_count) && (s < 64); s = s + 1) {
            if (!fs.subscribed[s]) {
                continue;
            }
            local b: *OrderBook = e.book(s);
            local fair: float = Ticks.toFloat(b.last_price > 0 ? b.last_price : b.reference_price);
            local sim: FlowSimulator = FlowSimulator.new(cast<u64>(seed) + cast<u64>(s), s, fair);
            local sum: SimSummary = sim.run(e, cast<int>(events));
            sim.destroy();
            ran = ran + sum.orders;
        }
        if (ran == 0) {
            return sendError(fs, "subscribe to a symbol first");
        }
        return pushUpdates(fs, e);
    }
    return sendError(fs, "unknown op");
}

frame jsonSession(socket: *WebSocket) {
    local s: *AppState = appState();
    local e: *Engine = &s.engine;
    local fs: FeedSession;
    fs.socket = socket;
    loop (local i: int = 0; i < 64; i = i + 1) {
        fs.subscribed[i] = false;
        fs.last_book_seq[i] = -1;
    }
    local latest: *Trade = e.tape.latest();
    fs.last_trade_id = latest == nullptr ? 0 : latest.id;
    fs.sent = 0;
    fs.heartbeats = 0;
    socket.setReadTimeout(5000);
    if (!hello(&fs, e)) {
        return;
    }
    loop {
        local m: WsMessage = socket.receive();
        if (m.ended()) {
            m.destroy();
            break;
        }
        local keep: bool = true;
        if (m.kind == WsKind.Timeout) {
            fs.heartbeats = fs.heartbeats + 1;
            local w: JsonWriter = JsonWriter.new(96);
            w.beginObject().fieldStr("type", "heartbeat").fieldInt("uptime_ms", s.uptimeMs()).endObject();
            keep = sendJson(&fs, &w) && pushUpdates(&fs, e);
            w.destroy();
        } else if (m.isText()) {
            keep = command(&fs, e, m.data);
        } else {
            keep = sendError(&fs, "binary commands are not supported");
        }
        m.destroy();
        if (!keep) {
            break;
        }
    }
}

# Streams a generated ITCH feed as binary frames, one packet per frame.
frame itchSession(socket: *WebSocket, events: int, seed: long) {
    local e: Engine = Engine.new(events + 16);
    e.addSymbol("ACME", Ticks.fromFloat(100.0));
    e.addSymbol("GLOBEX", Ticks.fromFloat(42.5));
    local pub: FeedPublisher;
    pub.init(&e, "BPLQ000001", 1400);
    pub.open();
    FeedSim.generate(&pub, &e, cast<u64>(seed), events);
    pub.close();
    local ok: bool = true;
    loop (local i: int = 0; (i < pub.writer.packet_count) && ok; i = i + 1) {
        local pk: *MoldPacket = pub.writer.packets + i;
        ok = socket.sendBinary(cast<string>(pk.data.data), cast<long>(pk.data.len));
    }
    if (ok) {
        socket.close(1000, "end of session");
    }
    pub.destroy();
    e.destroy();
}

frame wsFeedHandler(req: *Request, res: *Response) {
    if (!WebSocket.isUpgrade(req)) {
        res.status(426).setHeader("Upgrade", "websocket");
        Reply.error(res, 426, "WebSocket upgrade required");
        return;
    }
    local p: Params = Params.of(req);
    local format: string = p.str("format", "json");
    local events: int = p.integer("events", 2000, 1, 200000);
    local seed: long = p.longInt("seed", 1, 0, 9000000000000000000);
    local binary: bool = Text.equals(format, "itch");
    if (!binary && !Text.equals(format, "json")) {
        p.fail("format", "must be json or itch");
    }
    if (p.reject(res)) {
        return;
    }
    local socket: WebSocket = WebSocket.accept(req, res, nullptr);
    local cleanup: *WebSocket = &socket;
    defer cleanup.destroy();
    if (binary) {
        itchSession(&socket, events, seed);
    } else {
        jsonSession(&socket);
    }
}
