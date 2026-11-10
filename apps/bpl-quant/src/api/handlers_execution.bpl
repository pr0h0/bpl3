# Execution planning, TCA and surveillance routes.

import malloc, free from "std/c.bpl";
import [Math] from "std/math.bpl";
import [Request], [Response] from "bpl-express";
import [JsonWriter] from "../core/json_writer.bpl";
import [JsonKind] from "../core/json_doc.bpl";
import [Reply] from "./respond.bpl";
import [Params] from "./params.bpl";
import [Listing] from "./listing.bpl";
import [FValue] from "./filter.bpl";
import [AlmgrenChriss], [AcParams], [AcPlan], [Impact], [Fill], [Shortfall], [TcaReport], [TcaCalc] from "../execution/tca.bpl";
import [Surveillance], [SurvConfig], [Alert], [AlertKind] from "../market/surveillance.bpl";
import [Desk] from "../oms/desk.bpl";
import desk from "./handlers_oms.bpl";

export scheduleHandler;
export impactHandler;
export shortfallHandler;
export surveillanceHandler;

frame scheduleHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local params: AcParams;
    params.shares = p.requiredNum("shares", 1.0, 10000000000.0);
    params.periods = p.integer("periods", 10, 1, 1000);
    params.horizon = p.num("horizon", 1.0, 0.0001, 1000.0);
    params.sigma = p.requiredNum("sigma", 0.0, 1000000.0);
    params.eta = p.requiredNum("eta", 0.0, 1000.0);
    params.gamma = p.num("gamma", 0.0, 0.0, 1000.0);
    params.epsilon = p.num("epsilon", 0.0, 0.0, 1000.0);
    params.lambda = p.num("lambda", 0.000001, 0.0, 1000.0);
    params.price = p.num("price", 0.0, 0.0, 100000000.0);
    local points: int = p.integer("frontier_points", 9, 0, 100);
    if (p.reject(res)) {
        return;
    }
    local plan: AcPlan = AlmgrenChriss.plan(&params);
    local w: JsonWriter = JsonWriter.new(1024 + (plan.n * 60) + (points * 80));
    w.precision = 10;
    w.beginObject();
    w.fieldNum("kappa", plan.kappa);
    w.fieldNum("half_life", plan.half_life);
    w.fieldNum("expected_cost", plan.expected_cost);
    w.fieldNum("cost_stdev", Math.sqrt(plan.variance));
    if (params.price > 0.0) {
        w.fieldNum("expected_cost_bps", (plan.expected_cost / (params.shares * params.price)) * 10000.0);
    }
    w.fieldNumArray("holdings", plan.holdings, plan.n + 1);
    w.fieldNumArray("trades", plan.trades + 1, plan.n);
    if (points > 0) {
        local data: *float = cast<*float>(malloc(cast<long>(points * 3) * sizeof(float)));
        local lo: float = params.lambda > 0.0 ? params.lambda / 100.0 : 0.00000001;
        local hi: float = params.lambda > 0.0 ? params.lambda * 100.0 : 0.0001;
        AlmgrenChriss.frontier(&params, lo, hi, points, data, data + points, data + (2 * points));
        w.key("frontier").beginObject();
        w.fieldNumArray("lambda", data + (2 * points), points);
        w.fieldNumArray("expected_cost", data, points);
        w.fieldNumArray("cost_stdev", data + points, points);
        w.endObject();
        free(cast<*void>(data));
    }
    w.endObject();
    plan.destroy();
    Reply.ok(res, &w);
    w.destroy();
}

frame impactHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local qty: float = p.requiredNum("qty", 1.0, 100000000000.0);
    local adv: float = p.requiredNum("adv", 1.0, 100000000000.0);
    local vol: float = p.num("daily_vol", 0.02, 0.0001, 1.0);
    local y: float = p.num("y", 0.8, 0.01, 10.0);
    local minutes: float = p.num("minutes", 390.0, 1.0, 100000.0);
    if (p.reject(res)) {
        return;
    }
    local w: JsonWriter = JsonWriter.new(256);
    w.precision = 10;
    w.beginObject();
    w.fieldNum("impact_bps", Impact.squareRootBps(qty, adv, vol, y));
    w.fieldNum("fraction_of_adv", qty / adv);
    w.fieldNum("participation", Impact.participation(qty, adv, minutes, 390.0));
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

# Body: {"side":"buy|sell","target","decision","arrival","close","market_vwap",
#        "market_volume","fee_per_share","fills":[{"price","qty","time"}]}
frame shortfallHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    if (!p.parseBody(1048576)) {
        p.reject(res);
        return;
    }
    local options: string[2] = ["buy", "sell"];
    local side_text: string = p.oneOf("side", "buy", &options[0], 2);
    local target: float = p.requiredNum("target", 1.0, 100000000000.0);
    local decision: float = p.requiredNum("decision", 0.000001, 100000000.0);
    local arrival: float = p.num("arrival", decision, 0.000001, 100000000.0);
    local close: float = p.requiredNum("close", 0.000001, 100000000.0);
    local vwap: float = p.num("market_vwap", 0.0, 0.0, 100000000.0);
    local volume: float = p.num("market_volume", 0.0, 0.0, 100000000000000.0);
    local fee: float = p.num("fee_per_share", 0.0, 0.0, 100.0);
    if (p.reject(res)) {
        return;
    }
    local list: int = p.body.get(p.body.root(), "fills");
    local n: int = p.body.isKind(list, JsonKind.Array) ? p.body.length(list) : 0;
    if (n > 100000) {
        Reply.error(res, 422, "at most 100000 fills");
        return;
    }
    local fills: *Fill = cast<*Fill>(malloc(cast<long>(n + 1) * sizeof(Fill)));
    local cur: int = p.body.first(list);
    local i: int = 0;
    local bad: bool = false;
    loop (cur >= 0) {
        fills[i] = Fill { price: p.body.getNum(cur, "price", -1.0), quantity: p.body.getNum(cur, "qty", -1.0), time: p.body.getNum(cur, "time", 0.0) };
        if (!(fills[i].price > 0.0) || !(fills[i].quantity > 0.0)) {
            bad = true;
        }
        i = i + 1;
        cur = p.body.next(cur);
    }
    if (bad) {
        free(cast<*void>(fills));
        Reply.error(res, 422, "each fill needs price > 0 and qty > 0");
        return;
    }
    local side: float = side_text[0] == 'b' ? 1.0 : -1.0;
    local r: TcaReport = TcaCalc.report(side, target, decision, arrival, close, vwap, volume, fills, n, fee);
    free(cast<*void>(fills));
    local s: *Shortfall = &r.shortfall;
    local w: JsonWriter = JsonWriter.new(512);
    w.precision = 10;
    w.beginObject();
    w.fieldNum("executed", s.executed);
    w.fieldNum("unexecuted", s.unexecuted);
    w.fieldNum("avg_price", s.avg_price);
    w.key("shortfall").beginObject();
    w.fieldNum("delay", s.delay_cost);
    w.fieldNum("trading", s.trading_cost);
    w.fieldNum("opportunity", s.opportunity_cost);
    w.fieldNum("fees", s.fees);
    w.fieldNum("total", s.total);
    w.fieldNum("total_bps", s.total_bps);
    w.endObject();
    w.fieldNum("paper_return", s.paper_return);
    w.fieldNum("vs_arrival_bps", r.vs_arrival_bps);
    if (vwap > 0.0) {
        w.fieldNum("vs_vwap_bps", r.vs_vwap_bps);
    }
    w.fieldNum("vs_close_bps", r.vs_close_bps);
    if (volume > 0.0) {
        w.fieldNum("participation", r.participation);
    }
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

global alert_fields: string[6] = ["kind", "account", "other", "symbol", "seq", "score"];

frame alertField(sv: *Surveillance, a: *Alert, field: int) ret FValue {
    if (field == 0) {
        return FValue.text(Surveillance.kindName(a.kind));
    }
    if (field == 1) {
        return FValue.text(sv.accountName(a.account));
    }
    if (field == 2) {
        return FValue.text(sv.accountName(a.other));
    }
    if (field == 3) {
        return FValue.text(sv.symbolName(a.symbol));
    }
    if (field == 4) {
        return FValue.number(cast<float>(a.seq));
    }
    return FValue.number(a.score);
}

# Replays the desk journal through the detectors (?spoof_ratio=&max_otr=...).
frame surveillanceHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local config: SurvConfig = Surveillance.defaults();
    config.spoof_ratio = p.num("spoof_ratio", config.spoof_ratio, 1.0, 1000.0);
    config.spoof_window = p.longInt("spoof_window", config.spoof_window, 1, 1000000);
    config.max_otr = p.num("max_otr", config.max_otr, 1.0, 1000000.0);
    config.min_orders = p.integer("min_orders", config.min_orders, 1, 1000000);
    config.stuff_count = p.integer("stuff_count", config.stuff_count, 2, 1000000);
    config.stuff_window = p.longInt("stuff_window", config.stuff_window, 1, 1000000);
    config.close_fraction = p.num("close_fraction", config.close_fraction, 0.001, 0.5);
    config.close_share = p.num("close_share", config.close_share, 0.01, 1.0);
    config.close_bps = p.num("close_bps", config.close_bps, 0.0, 10000.0);
    if (p.reject(res)) {
        return;
    }
    local d: *Desk = desk();
    local sv: Surveillance;
    sv.init(config);
    local replayed: long = sv.run(&d.venue.journal.log);
    local svp: *Surveillance = &sv;
    local get: Lambda<FValue>(int, int) = |row: int, field: int| ret FValue {
        return alertField(svp, svp.alerts + row, field);
    };
    local q: Listing = Listing.run(req, sv.alert_count, &alert_fields[0], 6, get, 100, 1000);
    local owner: *Listing = &q;
    defer owner.destroy();
    if (q.reject(res)) {
        sv.destroy();
        return;
    }
    local w: JsonWriter = JsonWriter.new(512 + (q.count * 160));
    w.precision = 8;
    w.beginObject();
    w.fieldInt("records", replayed);
    w.fieldInt("orders", cast<long>(sv.order_count));
    w.fieldInt("cancels", sv.cancels);
    w.fieldInt("trades", cast<long>(sv.trade_count));
    if (d.has_snapshot) {
        w.fieldStr("note", "only records kept after the last compaction are replayed");
    }
    w.key("by_kind").beginObject();
    local kinds: AlertKind[5] = [AlertKind.Spoofing, AlertKind.WashTrade, AlertKind.OrderToTrade, AlertKind.QuoteStuffing, AlertKind.MarkingClose];
    loop (local k: int = 0; k < 5; k = k + 1) {
        w.fieldInt(Surveillance.kindName(kinds[k]), cast<long>(sv.count(kinds[k])));
    }
    w.endObject();
    q.writePaging(&w);
    w.key("alerts").beginArray();
    loop (local i: int = 0; i < q.count; i = i + 1) {
        Listing.writeRow(&w, &alert_fields[0], 6, q.rows[i], get);
    }
    w.endArray();
    w.endObject();
    sv.destroy();
    Reply.ok(res, &w);
    w.destroy();
}
