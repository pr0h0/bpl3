# Pricing-model comparison, immunization, pairs backtest and sizing routes.

import malloc, free from "std/c.bpl";
import [Math] from "std/math.bpl";
import [Request], [Response] from "bpl-express";
import [JsonWriter] from "../core/json_writer.bpl";
import [JsonKind] from "../core/json_doc.bpl";
import [Text] from "../core/text.bpl";
import [AppState], appState from "./state.bpl";
import [Reply] from "./respond.bpl";
import [Params] from "./params.bpl";
import [SeriesEntry] from "../series/store.bpl";
import [OptionSpec], [OptionKind] from "../quant/black_scholes.bpl";
import [PricingModel], [BlackScholesModel], [BachelierModel], [BinomialModel], [JumpModel], [BarrierModel], [ModelRegistry], [BarrierKind] from "../quant/models.bpl";
import [DiscountCurve] from "../rates/curve.bpl";
import [Bond] from "../rates/instruments.bpl";
import [Immunizer], [CashFlows], [ImmunizedPortfolio] from "../rates/immunize.bpl";
import [PairsBacktest], [PairsConfig], [PairsResult], [Sizing] from "../backtest/pairs.bpl";

export modelsHandler;
export immunizeHandler;
export pairsHandler;
export sizingHandler;

# Prices one contract with every model (?type=&spot=&strike=&rate=&dividend=
# &vol=&expiry=&steps=&intensity=&jump_mean=&jump_vol=&barrier=&barrier_type=&rebate=).
frame modelsHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local is_put: bool = Text.equals(p.str("type", "call"), "put");
    local spot: float = p.requiredNum("spot", 0.0001, 100000000.0);
    local strike: float = p.requiredNum("strike", 0.0001, 100000000.0);
    local rate: float = p.num("rate", 0.0, -1.0, 1.0);
    local dividend: float = p.num("dividend", 0.0, -1.0, 1.0);
    local vol: float = p.num("vol", 0.2, 0.0001, 5.0);
    local expiry: float = p.requiredNum("expiry", 0.0001, 50.0);
    local steps: int = p.integer("steps", 500, 1, 5000);
    local intensity: float = p.num("intensity", 0.1, 0.0, 50.0);
    local jump_mean: float = p.num("jump_mean", -0.05, -2.0, 2.0);
    local jump_vol: float = p.num("jump_vol", 0.1, 0.0, 2.0);
    local barrier: float = p.num("barrier", 0.0, 0.0, 100000000.0);
    local options: string[4] = ["down_out", "down_in", "up_out", "up_in"];
    local barrier_type: string = p.oneOf("barrier_type", "down_out", &options[0], 4);
    local rebate: float = p.num("rebate", 0.0, 0.0, 100000000.0);
    if (p.reject(res)) {
        return;
    }
    local spec_value: OptionSpec = OptionSpec.new(is_put ? OptionKind.Put : OptionKind.Call, spot, strike, rate, dividend, vol, expiry);
    local bs: BlackScholesModel = BlackScholesModel { tag: 0 };
    local normal: BachelierModel = BachelierModel { tag: 0 };
    local euro: BinomialModel = BinomialModel { steps: steps, american: false };
    local amer: BinomialModel = BinomialModel { steps: steps, american: true };
    local jumps: JumpModel = JumpModel { intensity: intensity, jump_mean: jump_mean, jump_vol: jump_vol };
    local kind: BarrierKind = BarrierKind.DownOut;
    if (Text.equals(barrier_type, "down_in")) {
        kind = BarrierKind.DownIn;
    } else if (Text.equals(barrier_type, "up_out")) {
        kind = BarrierKind.UpOut;
    } else if (Text.equals(barrier_type, "up_in")) {
        kind = BarrierKind.UpIn;
    }
    local barrier_model: BarrierModel = BarrierModel { kind: kind, barrier: barrier, rebate: rebate };
    local reg: ModelRegistry = ModelRegistry.create();
    reg.add(&bs);
    reg.add(&normal);
    reg.add(&euro);
    reg.add(&amer);
    reg.add(&jumps);
    if (barrier > 0.0) {
        reg.add(&barrier_model);
    }
    local w: JsonWriter = JsonWriter.new(1024);
    w.precision = 10;
    w.beginObject();
    w.key("prices").beginObject();
    loop (local i: int = 0; i < reg.count; i = i + 1) {
        local m: *PricingModel = reg.at(i);
        w.fieldNum(m.name(), m.price(&spec_value));
    }
    w.endObject();
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

# Body: {"rate":0.04, "liabilities":[{"time","amount"}], "bonds":[{"coupon","maturity","frequency"}]}
frame immunizeHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    if (!p.parseBody(65536)) {
        p.reject(res);
        return;
    }
    local rate: float = p.num("rate", 0.04, -0.1, 1.0);
    if (p.reject(res)) {
        return;
    }
    local root: int = p.body.root();
    local liab: int = p.body.get(root, "liabilities");
    local list: int = p.body.get(root, "bonds");
    local nl: int = p.body.isKind(liab, JsonKind.Array) ? p.body.length(liab) : 0;
    local nb: int = p.body.isKind(list, JsonKind.Array) ? p.body.length(list) : 0;
    if ((nl < 1) || (nl > 64) || (nb < 2) || (nb > 64)) {
        Reply.error(res, 422, "need 1-64 liabilities and 2-64 bonds");
        return;
    }
    local flows: CashFlows = CashFlows.empty();
    local cur: int = p.body.first(liab);
    loop (cur >= 0) {
        local t: float = p.body.getNum(cur, "time", -1.0);
        local amount: float = p.body.getNum(cur, "amount", 0.0);
        if (!(t > 0.0) || (t > 100.0) || !(amount > 0.0)) {
            Reply.error(res, 422, "liabilities need time in (0, 100] and amount > 0");
            return;
        }
        flows.add(t, amount);
        cur = p.body.next(cur);
    }
    local bonds: *Bond = cast<*Bond>(malloc(cast<long>(nb) * sizeof(Bond)));
    cur = p.body.first(list);
    local i: int = 0;
    loop (cur >= 0) {
        local maturity: float = p.body.getNum(cur, "maturity", -1.0);
        local freq: int = cast<int>(p.body.getNum(cur, "frequency", 2.0));
        if (!(maturity > 0.0) || (maturity > 30.0) || (freq < 1) || (freq > 2)) {
            free(cast<*void>(bonds));
            Reply.error(res, 422, "bonds need maturity in (0, 30] and frequency 1 or 2");
            return;
        }
        bonds[i] = Bond.new(100.0, p.body.getNum(cur, "coupon", 0.0), maturity, freq);
        i = i + 1;
        cur = p.body.next(cur);
    }
    local curve: DiscountCurve = DiscountCurve.flat(rate);
    local imm: ImmunizedPortfolio = Immunizer.immunize(&curve, &flows, bonds, nb);
    local w: JsonWriter = JsonWriter.new(1024);
    w.precision = 10;
    w.beginObject();
    w.fieldBool("found", imm.found);
    w.fieldNum("liability_pv", imm.liability_pv);
    w.fieldNum("liability_duration", imm.liability_duration);
    if (imm.found) {
        w.key("holdings").beginArray();
        w.beginObject().fieldInt("bond", cast<long>(imm.bond_a)).fieldNum("units", imm.units_a).endObject();
        w.beginObject().fieldInt("bond", cast<long>(imm.bond_b)).fieldNum("units", imm.units_b).endObject();
        w.endArray();
        w.fieldNum("asset_pv", imm.asset_pv);
        w.fieldNum("asset_duration", imm.asset_duration);
        w.fieldNum("asset_convexity", imm.asset_convexity);
        w.fieldNum("liability_convexity", imm.liability_convexity);
        w.fieldBool("redington", imm.redington);
        w.key("surplus_change").beginObject();
        w.fieldNum("minus_100bp", imm.surplus[0]).fieldNum("minus_50bp", imm.surplus[1]).fieldNum("plus_50bp", imm.surplus[2]).fieldNum("plus_100bp", imm.surplus[3]);
        w.endObject();
    } else {
        w.fieldStr("reason", "no bonds bracket the liability duration");
    }
    w.endObject();
    curve.destroy();
    free(cast<*void>(bonds));
    Reply.ok(res, &w);
    w.destroy();
}

frame closes(name: string) ret *SeriesEntry {
    local s: *AppState = appState();
    return s.series.find(name);
}

frame pairsHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local an: string = p.str("a", "ACME");
    local bn: string = p.str("b", "GLOBEX");
    local cfg: PairsConfig;
    cfg.window = p.integer("window", 60, 10, 1000);
    cfg.entry = p.num("entry", 2.0, 0.1, 10.0);
    cfg.exit = p.num("exit", 0.5, 0.0, 10.0);
    cfg.stop = p.num("stop", 4.0, 0.2, 20.0);
    cfg.cost_bps = p.num("cost_bps", 2.0, 0.0, 1000.0);
    cfg.capital = p.num("capital", 100000.0, 1.0, 1000000000000.0);
    if (p.reject(res)) {
        return;
    }
    local ea: *SeriesEntry = closes(an);
    local eb: *SeriesEntry = closes(bn);
    if ((ea == nullptr) || (eb == nullptr)) {
        Reply.notFound(res, "unknown symbol");
        return;
    }
    local n: int = ea.bars.len < eb.bars.len ? ea.bars.len : eb.bars.len;
    if (n <= (cfg.window + 2)) {
        Reply.error(res, 422, "not enough history for the window");
        return;
    }
    local r: PairsResult = PairsBacktest.run(ea.bars.close + (ea.bars.len - n), eb.bars.close + (eb.bars.len - n), n, &cfg);
    local w: JsonWriter = JsonWriter.new(512);
    w.precision = 10;
    w.beginObject();
    w.fieldInt("bars", cast<long>(n));
    w.fieldInt("trades", cast<long>(r.trades));
    w.fieldInt("wins", cast<long>(r.wins));
    w.fieldInt("stops", cast<long>(r.stops));
    w.fieldNum("total_return", r.total_return);
    w.fieldNum("sharpe", r.sharpe);
    w.fieldNum("max_drawdown", r.max_drawdown);
    w.fieldNum("exposure", r.exposure);
    w.fieldNum("spread_half_life", r.half_life);
    w.fieldNum("hedge_ratio", r.last_beta);
    w.fieldNum("z_score", r.last_z);
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

frame sizingHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local target: float = p.num("target_vol", 0.1, 0.001, 5.0);
    local max_lev: float = p.num("max_leverage", 3.0, 0.1, 100.0);
    local equity: float = p.num("equity", 100000.0, 1.0, 1000000000000.0);
    local risk: float = p.num("risk_fraction", 0.01, 0.0001, 1.0);
    local stop_pct: float = p.num("stop_pct", 0.05, 0.0001, 0.99);
    if (p.reject(res)) {
        return;
    }
    local e: *SeriesEntry = closes(Params.of(req).path("symbol"));
    if ((e == nullptr) || (e.bars.len < 30)) {
        Reply.notFound(res, "unknown symbol or under 30 bars");
        return;
    }
    local n: int = e.bars.len - 1;
    local r: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    loop (local i: int = 0; i < n; i = i + 1) {
        r[i] = (e.bars.close[i + 1] / e.bars.close[i]) - 1.0;
    }
    local k: float = Sizing.kelly(r, n);
    local last: float = e.bars.close[e.bars.len - 1];
    local w: JsonWriter = JsonWriter.new(512);
    w.precision = 10;
    w.beginObject();
    w.fieldNum("kelly", k);
    w.fieldNum("half_kelly", 0.5 * k);
    w.fieldNum("growth_at_kelly", Sizing.growth(r, n, k));
    w.fieldNum("growth_at_half_kelly", Sizing.growth(r, n, 0.5 * k));
    w.fieldNum("vol_target_leverage", Sizing.volTarget(r, n, target, 252.0, max_lev));
    w.fieldNum("fixed_fractional_shares", Sizing.fixedFractional(equity, risk, last, last * (1.0 - stop_pct)));
    w.endObject();
    free(cast<*void>(r));
    Reply.ok(res, &w);
    w.destroy();
}
