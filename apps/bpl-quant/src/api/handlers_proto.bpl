# FIX and market-data feed routes.
#
#   POST /api/fix/parse      FIX text ('|' or SOH delimited) -> fields
#   POST /api/fix/order      JSON order -> FIX NewOrderSingle through the
#                            desk's FIX session; returns the FIX traffic
#   POST /api/fix/cancel     JSON {orig_clordid, clordid}
#   GET  /api/fix/log        FIX messages exchanged (paged, filterable)
#   GET  /api/feed/replay    seeded lossy feed replay against the engine
#   GET  /api/feed/sample    first packets of a feed, hex and decoded

import [Request], [Response] from "bpl-express";
import [JsonWriter] from "../core/json_writer.bpl";
import [Text] from "../core/text.bpl";
import [StrList] from "../core/strlist.bpl";
import [Reply] from "./respond.bpl";
import [Params] from "./params.bpl";
import [Listing] from "./listing.bpl";
import [FValue] from "./filter.bpl";
import [FixMessage], [FixBuilder], [FixTag] from "../proto/fix.bpl";
import [Hex], [ByteReader] from "../proto/wire.bpl";
import [ItchMsg], [ItchCodec], [MoldPacket] from "../proto/itch.bpl";
import [FeedSim], [FeedReplayResult] from "../proto/feed_sim.bpl";
import [FeedPublisher] from "../proto/feed.bpl";
import [Engine] from "../market/engine.bpl";
import [Ticks] from "../market/order.bpl";
import [Desk] from "../oms/desk.bpl";
import desk from "./handlers_oms.bpl";

export fixParseHandler;
export fixOrderHandler;
export fixCancelHandler;
export fixLogHandler;
export feedReplayHandler;
export feedSampleHandler;

frame tagName(tag: int) ret string {
    local tags: int[24] = [1, 6, 8, 9, 10, 11, 14, 17, 31, 32, 34, 35, 37, 38, 39, 40, 41, 44, 49, 52, 54, 55, 56, 58];
    local names: string[24] = ["Account", "AvgPx", "BeginString", "BodyLength", "CheckSum", "ClOrdID", "CumQty", "ExecID", "LastPx", "LastQty", "MsgSeqNum", "MsgType", "OrderID", "OrderQty", "OrdStatus", "OrdType", "OrigClOrdID", "Price", "SenderCompID", "SendingTime", "Side", "Symbol", "TargetCompID", "Text"];
    loop (local i: int = 0; i < 24; i = i + 1) {
        if (tags[i] == tag) {
            return names[i];
        }
    }
    if (tag == 59) {
        return "TimeInForce";
    }
    if (tag == 99) {
        return "StopPx";
    }
    if (tag == 150) {
        return "ExecType";
    }
    if (tag == 151) {
        return "LeavesQty";
    }
    if (tag == 103) {
        return "OrdRejReason";
    }
    if (tag == 434) {
        return "CxlRejResponseTo";
    }
    return nullptr;
}

frame writeFix(w: *JsonWriter, m: *FixMessage) {
    w.beginObject();
    w.fieldStr("type", m.msgType());
    w.fieldInt("seq", m.seqNum());
    w.key("fields").beginArray();
    loop (local i: int = 0; i < m.count; i = i + 1) {
        w.beginObject();
        w.fieldInt("tag", cast<long>(m.fields[i].tag));
        local name: string = tagName(m.fields[i].tag);
        if (name != nullptr) {
            w.fieldStr("name", name);
        }
        w.fieldStr("value", m.valueAt(i));
        w.endObject();
    }
    w.endArray();
    w.endObject();
}

frame fixParseHandler(req: *Request, res: *Response) {
    if ((req.body == nullptr) || (req.body_length == 0) || (req.body_length > 65536)) {
        Reply.error(res, 400, "FIX message text required (max 64 KiB)");
        return;
    }
    local n: int = cast<int>(req.body_length);
    # Accept a trailing newline from curl.
    loop ((n > 0) && ((req.body[n - 1] == '\n') || (req.body[n - 1] == '\r'))) {
        n = n - 1;
    }
    local delim: char = Text.indexOfChar(req.body, '|', 0) >= 0 ? '|' : cast<char>(1);
    local m: FixMessage;
    local owner: *FixMessage = &m;
    defer owner.destroy();
    local ok: bool = m.parse(cast<*char>(req.body), n, delim);
    local w: JsonWriter = JsonWriter.new(1024);
    w.beginObject();
    w.fieldBool("valid", ok);
    if (!ok) {
        w.fieldStr("error", m.error);
    } else {
        w.key("message");
        writeFix(&w, &m);
    }
    w.endObject();
    Reply.json(res, ok ? 200 : 422, &w);
    w.destroy();
}

# Writes the FIX log entries from `first` as raw text and parsed fields.
frame writeTraffic(w: *JsonWriter, d: *Desk, first: int) {
    w.key("messages").beginArray();
    loop (local i: int = first; i < d.fix_log.count; i = i + 1) {
        local text: string = d.fix_log.get(i);
        local m: FixMessage;
        w.beginObject();
        w.fieldStr("raw", text);
        if (m.parse(cast<*char>(text), Text.length(text), '|')) {
            w.fieldStr("direction", Text.equals(m.getOr(49, ""), "CLIENT") ? "in" : "out");
            w.fieldStr("type", m.msgType());
            w.fieldInt("seq", m.seqNum());
            local exec: string = m.get(150);
            if (exec != nullptr) {
                w.fieldStr("exec_type", exec);
                w.fieldStr("ord_status", m.getOr(39, ""));
                w.fieldInt("cum_qty", m.getLong(14, 0));
                w.fieldInt("leaves_qty", m.getLong(151, 0));
            }
            local text_field: string = m.get(58);
            if (text_field != nullptr) {
                w.fieldStr("text", text_field);
            }
        }
        m.destroy();
        w.endObject();
    }
    w.endArray();
}

# Body: {"clordid","symbol","side":"buy|sell","qty","type":"limit|market","price","tif":"gtc|ioc|fok|day"}
frame fixOrderHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    p.parseBody(8192);
    if (p.reject(res)) {
        return;
    }
    local clid: string = p.requiredStr("clordid", 64);
    local symbol: string = p.symbol("symbol");
    local side_options: string[2] = ["buy", "sell"];
    local side: string = p.oneOf("side", "buy", &side_options[0], 2);
    local type_options: string[2] = ["limit", "market"];
    local kind: string = p.oneOf("type", "limit", &type_options[0], 2);
    local tif_options: string[4] = ["gtc", "ioc", "fok", "day"];
    local tif: string = p.oneOf("tif", "gtc", &tif_options[0], 4);
    local qty: long = p.longInt("qty", 0, 1, 1000000000);
    if (!p.present("qty")) {
        p.fail("qty", "is required");
    }
    local is_limit: bool = Text.equals(kind, "limit");
    local price: float = is_limit ? p.requiredNum("price", 0.0001, 10000000.0) : 0.0;
    if (p.reject(res)) {
        return;
    }
    local d: *Desk = desk();
    local b: *FixBuilder = d.client.start("D");
    b.field(11, clid);
    b.field(55, symbol);
    b.field(54, Text.equals(side, "buy") ? "1" : "2");
    b.fieldLong(38, qty);
    b.field(40, is_limit ? "2" : "1");
    if (is_limit) {
        b.fieldTicks(44, Ticks.fromFloat(price), 4);
    }
    local tif_code: string = "1";
    if (Text.equals(tif, "ioc")) {
        tif_code = "3";
    } else if (Text.equals(tif, "fok")) {
        tif_code = "4";
    } else if (Text.equals(tif, "day")) {
        tif_code = "0";
    }
    b.field(59, tif_code);
    local first: int = d.sendFix();
    local w: JsonWriter = JsonWriter.new(2048);
    w.beginObject();
    w.fieldStr("session", d.server.stateName());
    writeTraffic(&w, d, first);
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

frame fixCancelHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    p.parseBody(4096);
    if (p.reject(res)) {
        return;
    }
    local orig: string = p.requiredStr("orig_clordid", 64);
    local clid: string = p.requiredStr("clordid", 64);
    if (p.reject(res)) {
        return;
    }
    local d: *Desk = desk();
    local b: *FixBuilder = d.client.start("F");
    b.field(11, clid);
    b.field(41, orig);
    local first: int = d.sendFix();
    local w: JsonWriter = JsonWriter.new(1024);
    w.beginObject();
    writeTraffic(&w, d, first);
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

global fix_log_fields: string[5] = ["index", "type", "seq", "sender", "raw"];

frame fixLogHandler(req: *Request, res: *Response) {
    local d: *Desk = desk();
    local get: Lambda<FValue>(int, int) = |row: int, field: int| ret FValue {
        local text: string = d.fix_log.get(row);
        if (field == 0) {
            return FValue.number(cast<float>(row));
        }
        if (field == 4) {
            return FValue.text(text);
        }
        local m: FixMessage;
        local v: FValue = FValue.none();
        if (m.parse(cast<*char>(text), Text.length(text), '|')) {
            if (field == 1) {
                v = FValue.text(FixLogText.keep(m.msgType()));
            } else if (field == 2) {
                v = FValue.number(cast<float>(m.seqNum()));
            } else {
                v = FValue.text(FixLogText.keep(m.getOr(49, "")));
            }
        }
        m.destroy();
        return v;
    };
    local q: Listing = Listing.run(req, d.fix_log.count, &fix_log_fields[0], 5, get, 50, 1000);
    local owner: *Listing = &q;
    defer owner.destroy();
    if (q.reject(res)) {
        return;
    }
    local w: JsonWriter = JsonWriter.new(256 + (q.count * 300));
    w.beginObject();
    q.writePaging(&w);
    w.key("messages").beginArray();
    loop (local i: int = 0; i < q.count; i = i + 1) {
        Listing.writeRow(&w, &fix_log_fields[0], 5, q.rows[i], get);
    }
    w.endArray();
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
    FixLogText.reset();
}

# Field values copied out of parsed messages so they outlive the message
# (filter evaluation compares them after the getter returns); released
# after each request.
global fix_log_strings: StrList;
global fix_log_strings_ready: bool = false;

struct FixLogText {
    frame keep(s: string) ret string {
        if (!fix_log_strings_ready) {
            fix_log_strings = StrList.new(64);
            fix_log_strings_ready = true;
        }
        local copy: string = Text.copy(s);
        fix_log_strings.adopt(copy);
        return copy;
    }

    frame reset() {
        if (fix_log_strings_ready) {
            fix_log_strings.clear();
        }
    }
}

frame feedReplayHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local events: int = p.integer("events", 20000, 1, 500000);
    local symbols: int = p.integer("symbols", 3, 1, 6);
    local packet_bytes: int = p.integer("packet_bytes", 1400, 64, 65000);
    local drop_every: int = p.integer("drop_every", 0, 0, 1000000);
    local seed: long = p.longInt("seed", 1, 0, 9000000000000000000);
    if (p.reject(res)) {
        return;
    }
    if (drop_every == 1) {
        Reply.error(res, 422, "drop_every must be 0 (no loss) or at least 2");
        return;
    }
    local r: FeedReplayResult = FeedSim.run(cast<u64>(seed), events, symbols, packet_bytes, drop_every);
    local w: JsonWriter = JsonWriter.new(1024);
    w.beginObject();
    w.fieldInt("events", cast<long>(r.events));
    w.fieldInt("packets", cast<long>(r.packets));
    w.fieldInt("messages", r.messages);
    w.fieldInt("bytes", r.bytes);
    w.fieldFixed("bytes_per_message", r.messages > 0 ? cast<float>(r.bytes) / cast<float>(r.messages) : 0.0, 2);
    w.key("published").beginObject().fieldInt("adds", r.adds).fieldInt("executions", r.executions).fieldInt("deletes", r.deletes).fieldInt("partial_cancels", r.partial_cancels).endObject();
    w.key("replay").beginObject();
    w.fieldInt("dropped_packets", cast<long>(r.dropped));
    w.fieldInt("gaps", r.gaps);
    w.fieldInt("retransmitted", cast<long>(r.recovered + r.tail_recovered));
    w.fieldInt("applied", r.applied);
    w.fieldInt("live_orders", cast<long>(r.live_orders));
    w.fieldInt("engine_orders", cast<long>(r.engine_orders));
    w.fieldInt("mismatched_levels", cast<long>(r.mismatched_levels));
    w.fieldBool("books_match", (r.mismatched_levels == 0) && (r.live_orders == r.engine_orders));
    w.endObject();
    w.fieldNum("best_bid", Ticks.toFloat(r.best_bid));
    w.fieldNum("best_ask", Ticks.toFloat(r.best_ask));
    w.fieldInt("volume", r.volume);
    w.fieldFixed("generate_ms", r.generate_ms, 3);
    w.fieldFixed("replay_ms", r.replay_ms, 3);
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

frame writeItch(w: *JsonWriter, m: *ItchMsg) {
    w.beginObject();
    local kind: char[2];
    kind[0] = m.kind;
    kind[1] = cast<char>(0);
    w.fieldStr("type", cast<string>(&kind[0]));
    w.fieldStr("name", ItchCodec.kindName(m.kind));
    w.fieldInt("locate", cast<long>(m.locate));
    w.fieldInt("timestamp_ns", m.timestamp);
    if (m.kind == 'R') {
        w.fieldStr("symbol", cast<string>(&m.symbol[0]));
        w.fieldNum("reference_price", Ticks.toFloat(m.price));
    } else if (m.kind == 'S') {
        local code: char[2];
        code[0] = m.code;
        code[1] = cast<char>(0);
        w.fieldStr("code", cast<string>(&code[0]));
    } else {
        w.fieldInt("ref", m.ref);
        if (m.kind == 'A') {
            w.fieldStr("side", m.side == 'B' ? "buy" : "sell");
            w.fieldInt("shares", m.shares);
            w.fieldNum("price", Ticks.toFloat(m.price));
        } else if ((m.kind == 'E') || (m.kind == 'X')) {
            w.fieldInt("shares", m.shares);
            if (m.kind == 'E') {
                w.fieldInt("match", m.match_no);
            }
        }
    }
    w.endObject();
}

frame feedSampleHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local events: int = p.integer("events", 20, 1, 2000);
    local packets: int = p.integer("packets", 2, 1, 20);
    local seed: long = p.longInt("seed", 1, 0, 9000000000000000000);
    if (p.reject(res)) {
        return;
    }
    local e: Engine = Engine.new(events + 16);
    e.addSymbol("ACME", Ticks.fromFloat(100.0));
    e.addSymbol("GLOBEX", Ticks.fromFloat(42.5));
    local pub: FeedPublisher;
    pub.init(&e, "BPLQ000001", 512);
    pub.open();
    FeedSim.generate(&pub, &e, cast<u64>(seed), events);
    pub.close();
    local w: JsonWriter = JsonWriter.new(8192);
    w.beginObject();
    w.fieldInt("packets_total", cast<long>(pub.writer.packet_count));
    w.key("packets").beginArray();
    local shown: int = packets < pub.writer.packet_count ? packets : pub.writer.packet_count;
    local wp: *JsonWriter = &w;
    local handler: Lambda<void>(*ItchMsg) = |m: *ItchMsg| {
        writeItch(wp, m);
    };
    loop (local i: int = 0; i < shown; i = i + 1) {
        local pk: *MoldPacket = pub.writer.packets + i;
        w.beginObject();
        w.fieldInt("sequence", pk.sequence);
        w.fieldInt("count", cast<long>(pk.count));
        w.fieldInt("bytes", cast<long>(pk.data.len));
        local hex: string = Hex.encode(pk.data.data, pk.data.len < 64 ? pk.data.len : 64);
        w.fieldStr("hex_prefix", hex);
        Text.release(hex);
        w.key("messages").beginArray();
        local r: ByteReader = ByteReader.over(pk.data.data, pk.data.len);
        r.skip(20);
        loop (local k: int = 0; k < pk.count; k = k + 1) {
            local len: int = r.u16be();
            local m: ItchMsg;
            if (ItchCodec.decode(&r, len, &m)) {
                handler(&m);
            }
        }
        w.endArray();
        w.endObject();
    }
    w.endArray();
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
    pub.destroy();
    e.destroy();
}
