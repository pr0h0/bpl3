# Persistence endpoints (enabled when the server runs with BPLQUANT_DB).

import [Request], [Response] from "bpl-express";
import [Statement] from "bpl-sqlite";
import [JsonWriter] from "../core/json_writer.bpl";
import [Clock] from "../core/clock.bpl";
import [Text] from "../core/text.bpl";
import [AppState], appState from "./state.bpl";
import [Reply] from "./respond.bpl";
import [Params] from "./params.bpl";
import [SeriesEntry] from "../series/store.bpl";
import [BarSeries] from "../series/bars.bpl";
import [StoreStats] from "../store/db.bpl";

export storeStatsHandler;
export storeFlushHandler;
export storeSaveBarsHandler;
export storeLoadBarsHandler;
export storeTradesHandler;

frame requireStore(res: *Response) ret *AppState {
    local s: *AppState = appState();
    if (!s.store.open) {
        Reply.error(res, 503, "persistence is disabled (start the server with BPLQUANT_DB=path)");
        return nullptr;
    }
    return s;
}

frame storeStatsHandler(_req: *Request, res: *Response) {
    local s: *AppState = requireStore(res);
    if (s == nullptr) {
        return;
    }
    local st: StoreStats = s.store.stats();
    local w: JsonWriter = JsonWriter.new(256);
    w.beginObject();
    w.fieldInt("trades", st.trades);
    w.fieldInt("bars", st.bars);
    w.fieldInt("bar_symbols", st.symbols);
    w.fieldInt("max_trade_id", st.max_trade_id);
    w.fieldInt("worker", cast<long>(s.worker_id));
    w.fieldInt("worker_last_trade_id", s.store.last_trade_id);
    w.fieldBool("integrity_ok", s.store.integrity());
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

frame storeFlushHandler(_req: *Request, res: *Response) {
    local s: *AppState = requireStore(res);
    if (s == nullptr) {
        return;
    }
    local started: long = Clock.nowNs();
    local n: int = s.store.persistTrades(&s.engine);
    s.persisted_trades = s.persisted_trades + cast<long>(n);
    local w: JsonWriter = JsonWriter.new(128);
    w.beginObject().fieldInt("written", cast<long>(n)).fieldInt("total_written", s.persisted_trades).fieldFixed("elapsed_ms", Clock.elapsedMs(started), 3).endObject();
    Reply.ok(res, &w);
    w.destroy();
}

frame storeSaveBarsHandler(req: *Request, res: *Response) {
    local s: *AppState = requireStore(res);
    if (s == nullptr) {
        return;
    }
    local p: Params = Params.of(req);
    local symbol: string = p.path("symbol");
    local e: *SeriesEntry = s.series.find(symbol);
    if (e == nullptr) {
        Reply.notFound(res, "no series for symbol");
        return;
    }
    local n: int = s.store.saveBars(symbol, &e.bars);
    local w: JsonWriter = JsonWriter.new(128);
    w.beginObject().fieldStr("symbol", symbol).fieldInt("saved", cast<long>(n)).endObject();
    Reply.ok(res, &w);
    w.destroy();
}

frame storeLoadBarsHandler(req: *Request, res: *Response) {
    local s: *AppState = requireStore(res);
    if (s == nullptr) {
        return;
    }
    local p: Params = Params.of(req);
    local symbol: string = p.path("symbol");
    if (!Text.isSymbol(symbol)) {
        Reply.error(res, 422, "invalid symbol");
        return;
    }
    local bars: BarSeries;
    if (!s.store.loadBars(symbol, 86400, &bars)) {
        bars.destroy();
        Reply.notFound(res, "no stored bars for symbol");
        return;
    }
    local n: int = bars.len;
    s.series.load(symbol, bars);
    local w: JsonWriter = JsonWriter.new(128);
    w.beginObject().fieldStr("symbol", symbol).fieldInt("loaded", cast<long>(n)).endObject();
    Reply.ok(res, &w);
    w.destroy();
}

# Trades read back from SQLite (all workers), newest first.
frame storeTradesHandler(req: *Request, res: *Response) {
    local s: *AppState = requireStore(res);
    if (s == nullptr) {
        return;
    }
    local p: Params = Params.of(req);
    local limit: int = p.integer("limit", 50, 1, 5000);
    local symbol: string = p.str("symbol", nullptr);
    if (p.reject(res)) {
        return;
    }
    local q: Statement = symbol == nullptr ? s.store.db.prepare("SELECT id, worker, symbol, price, qty, side, buyer, seller, ts FROM trades ORDER BY ts DESC, id DESC LIMIT ?") : s.store.db.prepare("SELECT id, worker, symbol, price, qty, side, buyer, seller, ts FROM trades WHERE symbol=? ORDER BY ts DESC, id DESC LIMIT ?");
    local qo: *Statement = &q;
    defer qo.close();
    if (symbol == nullptr) {
        q.bindInt(1, cast<long>(limit));
    } else {
        q.bindText(1, symbol).bindInt(2, cast<long>(limit));
    }
    local w: JsonWriter = JsonWriter.new(4096);
    w.beginObject();
    w.key("trades").beginArray();
    local count: int = 0;
    loop (q.step()) {
        w.beginObject();
        w.fieldInt("id", q.integer(0));
        w.fieldInt("worker", q.integer(1));
        w.fieldStr("symbol", q.text(2));
        w.fieldFixed("price", q.real(3), 4);
        w.fieldInt("qty", q.integer(4));
        w.fieldStr("side", q.text(5));
        w.fieldStr("buyer", q.text(6));
        w.fieldStr("seller", q.text(7));
        w.fieldInt("time", q.integer(8));
        w.endObject();
        count = count + 1;
    }
    w.endArray();
    w.fieldInt("count", cast<long>(count));
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}
