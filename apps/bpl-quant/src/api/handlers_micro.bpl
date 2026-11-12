# Microstructure endpoints: account positions, call auctions, execution
# algorithms and the market-making simulation.

import [Request], [Response] from "bpl-express";
import [JsonWriter] from "../core/json_writer.bpl";
import [JsonKind] from "../core/json_doc.bpl";
import [Text] from "../core/text.bpl";
import [Clock] from "../core/clock.bpl";
import [AppState], appState from "./state.bpl";
import [Reply] from "./respond.bpl";
import [Params] from "./params.bpl";
import [Engine] from "../market/engine.bpl";
import [Side], [Ticks] from "../market/order.bpl";
import [OrderBook] from "../market/book.bpl";
import [Ledger], [Position], [AccountSummary] from "../market/ledger.bpl";
import [Auction], [AuctionOrder], [AuctionResult] from "../market/auction.bpl";
import [ExecAlgo], [AlgoKind], [AlgoReport], [MarketMaker], [MakerReport] from "../market/algos.bpl";
import [FlowSimulator] from "../market/simulator.bpl";

export accountsHandler;
export accountHandler;
export auctionHandler;
export algoHandler;
export makerHandler;

global ledger_ready: bool;
global ledger: Ledger;

frame syncedLedger(e: *Engine) ret *Ledger {
    if (!ledger_ready) {
        ledger = Ledger.new(0.0);
        ledger_ready = true;
    }
    ledger.sync(e);
    return &ledger;
}

frame writeSummary(w: *JsonWriter, e: *Engine, s: *AccountSummary) {
    w.beginObject();
    w.fieldStr("account", e.accounts.name(s.account));
    w.fieldInt("positions", cast<long>(s.positions));
    w.fieldNum("gross_exposure", s.gross_exposure);
    w.fieldNum("net_exposure", s.net_exposure);
    w.fieldNum("realized", s.realized);
    w.fieldNum("unrealized", s.unrealized);
    w.fieldNum("fees", s.fees);
    w.fieldNum("equity", s.equity);
    w.endObject();
}

frame accountsHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local limit: int = p.integer("limit", 20, 1, 1000);
    if (p.reject(res)) {
        return;
    }
    local s: *AppState = appState();
    local l: *Ledger = syncedLedger(&s.engine);
    local w: JsonWriter = JsonWriter.new(4096);
    w.precision = 10;
    w.beginObject();
    w.fieldInt("accounts", cast<long>(s.engine.accounts.count));
    w.fieldInt("positions", cast<long>(l.count));
    w.fieldNum("zero_sum_check", l.grossPnl(&s.engine));
    w.key("summaries").beginArray();
    local shown: int = 0;
    loop (local a: int = 0; (a < s.engine.accounts.count) && (shown < limit); a = a + 1) {
        local sum: AccountSummary = l.summary(&s.engine, a);
        writeSummary(&w, &s.engine, &sum);
        shown = shown + 1;
    }
    w.endArray();
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

frame accountHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local name: string = p.path("name");
    local s: *AppState = appState();
    local id: int = s.engine.accounts.find(name);
    if (id < 0) {
        Reply.notFound(res, "unknown account");
        return;
    }
    local l: *Ledger = syncedLedger(&s.engine);
    local sum: AccountSummary = l.summary(&s.engine, id);
    local w: JsonWriter = JsonWriter.new(2048);
    w.precision = 10;
    w.beginObject();
    w.key("summary");
    writeSummary(&w, &s.engine, &sum);
    w.key("positions").beginArray();
    loop (local i: int = 0; i < l.count; i = i + 1) {
        local pos: *Position = l.positions + i;
        if (pos.account != id) {
            continue;
        }
        local mark: float = Ledger.markPrice(&s.engine, pos.symbol);
        w.beginObject();
        w.fieldStr("symbol", s.engine.symbolName(pos.symbol));
        w.fieldInt("quantity", pos.quantity);
        w.fieldNum("average_cost", l.averageCost(pos));
        w.fieldNum("mark", mark);
        w.fieldNum("realized", pos.realized);
        w.fieldNum("unrealized", l.unrealized(pos, mark));
        w.fieldInt("trades", pos.trades);
        w.fieldInt("traded_volume", pos.traded_volume);
        w.endObject();
    }
    w.endArray();
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

# Body: {"reference": 10.0, "orders": [{"side": "buy", "price": 10.1, "qty": 100}, ...]} (price 0 = market)
frame auctionHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    if (!p.parseBody(262144)) {
        p.reject(res);
        return;
    }
    local reference: float = p.requiredNum("reference", 0.0001, 100000000.0);
    if (p.reject(res)) {
        return;
    }
    local arr: int = p.body.get(p.body.root(), "orders");
    local n: int = p.body.length(arr);
    if (!p.body.isKind(arr, JsonKind.Array) || (n < 1) || (n > 10000)) {
        Reply.error(res, 422, "orders must be an array of 1-10000 objects");
        return;
    }
    local a: Auction = Auction.new(Ticks.fromFloat(reference));
    local cur: int = p.body.first(arr);
    loop (cur >= 0) {
        local side: Side = Side.Buy;
        if (!Ticks.parseSide(p.body.getStr(cur, "side"), &side)) {
            a.destroy();
            Reply.error(res, 422, "each order needs side buy or sell");
            return;
        }
        local price: float = p.body.getNum(cur, "price", -1.0);
        local qty: float = p.body.getNum(cur, "qty", -1.0);
        if ((price < 0.0) || (qty < 1.0) || (qty != cast<float>(cast<long>(qty)))) {
            a.destroy();
            Reply.error(res, 422, "each order needs price >= 0 and an integer qty >= 1");
            return;
        }
        a.add(0, side, Ticks.fromFloat(price), cast<long>(qty));
        cur = p.body.next(cur);
    }
    local r: AuctionResult = a.uncross();
    local w: JsonWriter = JsonWriter.new(1024 + (n * 48));
    w.beginObject();
    w.fieldBool("crossed", r.crossed);
    w.fieldFixed("price", Ticks.toFloat(r.price), 4);
    w.fieldInt("volume", r.volume);
    w.fieldInt("imbalance", r.imbalance);
    w.fieldInt("buy_interest", r.buy_interest);
    w.fieldInt("sell_interest", r.sell_interest);
    w.fieldInt("candidate_prices", cast<long>(r.candidates));
    w.key("fills").beginArray();
    loop (local i: int = 0; i < a.count; i = i + 1) {
        w.integer(a.orders[i].filled);
    }
    w.endArray();
    w.endObject();
    a.destroy();
    Reply.ok(res, &w);
    w.destroy();
}

global algo_names: string[3] = ["twap", "vwap", "pov"];

# Runs on a scratch engine seeded from the symbol's last price, so the live
# book is untouched.
frame algoHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local symbol: string = p.path("symbol");
    local kind_name: string = p.oneOf("kind", "twap", &algo_names[0], 3);
    local side_text: string = p.str("side", "buy");
    local qty: long = p.longInt("qty", 10000, 1, 10000000);
    local slices: int = p.integer("slices", 20, 1, 500);
    local events: int = p.integer("events_per_slice", 500, 10, 20000);
    local pov: float = p.num("participation", 0.1, 0.01, 0.5);
    local cap: float = p.num("cap_bps", 20.0, 0.1, 1000.0);
    local seed: long = p.longInt("seed", 1, 0, 9223372036854775807);
    local side: Side = Side.Buy;
    if (!Ticks.parseSide(side_text, &side)) {
        p.fail("side", "must be buy or sell");
    }
    if (p.reject(res)) {
        return;
    }
    local s: *AppState = appState();
    local id: int = s.engine.symbolId(symbol);
    if (id < 0) {
        Reply.notFound(res, "unknown symbol");
        return;
    }
    local b: *OrderBook = s.engine.book(id);
    local fair: float = Ticks.toFloat(b.last_price > 0 ? b.last_price : b.reference_price);
    local kind: AlgoKind = AlgoKind.Twap;
    if (Text.equals(kind_name, "vwap")) {
        kind = AlgoKind.Vwap;
    } else if (Text.equals(kind_name, "pov")) {
        kind = AlgoKind.Pov;
    }
    local started: long = Clock.nowNs();
    local scratch: Engine = Engine.new(65536);
    local sym: int = scratch.addSymbol(symbol, Ticks.fromFloat(fair));
    local sim: FlowSimulator = FlowSimulator.new(cast<u64>(seed), sym, fair);
    local r: AlgoReport = ExecAlgo.run(&scratch, &sim, kind, sym, scratch.accountId("algo"), side, qty, slices, events, pov, cap);
    local w: JsonWriter = JsonWriter.new(512);
    w.precision = 10;
    w.beginObject();
    w.fieldStr("kind", kind_name);
    w.fieldInt("target", r.target);
    w.fieldInt("filled", r.filled);
    w.fieldNum("average_price", r.average_price);
    w.fieldNum("arrival_mid", r.arrival_mid);
    w.fieldNum("shortfall_bps", r.shortfall_bps);
    w.fieldInt("child_orders", cast<long>(r.child_orders));
    w.fieldInt("market_volume", r.market_volume);
    w.fieldNum("participation", r.participation);
    w.fieldFixed("elapsed_ms", Clock.elapsedMs(started), 3);
    w.endObject();
    sim.destroy();
    scratch.destroy();
    Reply.ok(res, &w);
    w.destroy();
}

frame makerHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local symbol: string = p.path("symbol");
    local gamma: float = p.num("gamma", 0.05, 0.0001, 10.0);
    local sigma: float = p.num("sigma", 0.05, 0.0001, 10.0);
    local kappa: float = p.num("kappa", 50.0, 0.01, 10000.0);
    local size: long = p.longInt("size", 50, 1, 100000);
    local steps: int = p.integer("steps", 200, 1, 5000);
    local events: int = p.integer("events_per_step", 50, 1, 5000);
    local max_inv: long = p.longInt("max_inventory", 500, 1, 10000000);
    local seed: long = p.longInt("seed", 1, 0, 9223372036854775807);
    if (p.reject(res)) {
        return;
    }
    local s: *AppState = appState();
    local id: int = s.engine.symbolId(symbol);
    if (id < 0) {
        Reply.notFound(res, "unknown symbol");
        return;
    }
    local b: *OrderBook = s.engine.book(id);
    local fair: float = Ticks.toFloat(b.last_price > 0 ? b.last_price : b.reference_price);
    local started: long = Clock.nowNs();
    local scratch: Engine = Engine.new(65536);
    local sym: int = scratch.addSymbol(symbol, Ticks.fromFloat(fair));
    local sim: FlowSimulator = FlowSimulator.new(cast<u64>(seed), sym, fair);
    local mm: MarketMaker = MarketMaker { gamma: gamma, sigma: sigma, kappa: kappa, horizon: 1.0, size: size, max_inventory: max_inv };
    local r: MakerReport = mm.run(&scratch, &sim, sym, scratch.accountId("maker"), steps, events);
    local w: JsonWriter = JsonWriter.new(512);
    w.precision = 10;
    w.beginObject();
    w.fieldInt("steps", cast<long>(r.steps));
    w.fieldInt("quotes", r.quotes);
    w.fieldInt("fills", r.fills);
    w.fieldInt("volume", r.volume);
    w.fieldInt("final_inventory", r.final_inventory);
    w.fieldInt("max_inventory", r.max_inventory);
    w.fieldNum("pnl", r.pnl);
    w.fieldNum("average_spread_bps", r.average_spread_bps);
    w.fieldFixed("elapsed_ms", Clock.elapsedMs(started), 3);
    w.endObject();
    sim.destroy();
    scratch.destroy();
    Reply.ok(res, &w);
    w.destroy();
}
