# Fixed-income endpoints: curve bootstrap/fit, bonds, swaps, caps,
# swaptions and short-rate models.

import [Request], [Response] from "bpl-express";
import malloc, free from "std/c.bpl";
import [Math] from "std/math.bpl";
import [JsonWriter] from "../core/json_writer.bpl";
import [JsonKind] from "../core/json_doc.bpl";
import [Text] from "../core/text.bpl";
import [Reply] from "./respond.bpl";
import [Params] from "./params.bpl";
import [DiscountCurve], [Interp], [CurveInstrument], [InstrumentKind], [NelsonSiegel], [Bootstrap] from "../rates/curve.bpl";
import [Bond], [BondMetrics], [Swap], [SwapMetrics], [CapFloor], [ShortRate] from "../rates/instruments.bpl";
import [RootResult] from "../math/optimize.bpl";

export curveHandler;
export bondHandler;
export swapHandler;
export capHandler;
export swaptionHandler;
export shortRateHandler;
export defaultCurve;

global interp_names: string[3] = ["log_linear", "linear", "cubic"];

# A representative USD-like curve: deposits to 1y, then annual par swaps.
frame defaultInstruments(out: *CurveInstrument) ret int {
    local mats: float[12] = [0.25, 0.5, 1.0, 2.0, 3.0, 4.0, 5.0, 7.0, 10.0, 15.0, 20.0, 30.0];
    local rates: float[12] = [0.0430, 0.0435, 0.0440, 0.0420, 0.0405, 0.0398, 0.0395, 0.0393, 0.0395, 0.0400, 0.0402, 0.0398];
    loop (local i: int = 0; i < 12; i = i + 1) {
        local kind: InstrumentKind = mats[i] <= 1.0 ? InstrumentKind.Deposit : InstrumentKind.Swap;
        out[i] = CurveInstrument { kind: kind, start: 0.0, maturity: mats[i], rate: rates[i], frequency: 1 };
    }
    return 12;
}

frame defaultCurve(interp: Interp) ret DiscountCurve {
    local insts: CurveInstrument[12];
    local n: int = defaultInstruments(&insts[0]);
    local err: string = nullptr;
    return Bootstrap.build(&insts[0], n, interp, &err);
}

frame interpFrom(p: *Params) ret Interp {
    local name: string = p.oneOf("interp", "log_linear", &interp_names[0], 3);
    if (Text.equals(name, "linear")) {
        return Interp.LinearZero;
    }
    if (Text.equals(name, "cubic")) {
        return Interp.CubicSpline;
    }
    return Interp.LogLinearDiscount;
}

# Curve from a JSON body {"instruments":[{"type":"deposit|fra|swap","maturity":..,"rate":..}]}
# or the built-in default curve.
frame curveFrom(p: *Params, res: *Response, out: *DiscountCurve) ret bool {
    local interp: Interp = interpFrom(p);
    if (!p.has_body || !p.body.has(p.body.root(), "instruments")) {
        *out = defaultCurve(interp);
        return true;
    }
    local arr: int = p.body.get(p.body.root(), "instruments");
    local n: int = p.body.length(arr);
    if (!p.body.isKind(arr, JsonKind.Array) || (n < 1) || (n > 64)) {
        Reply.error(res, 422, "instruments must be an array of 1-64 objects");
        return false;
    }
    local insts: *CurveInstrument = cast<*CurveInstrument>(malloc(cast<long>(n) * sizeof(CurveInstrument)));
    local cur: int = p.body.first(arr);
    local i: int = 0;
    loop (cur >= 0) {
        local kind_text: string = p.body.getStr(cur, "type");
        local kind: InstrumentKind = InstrumentKind.Swap;
        if (Text.equals(kind_text, "deposit")) {
            kind = InstrumentKind.Deposit;
        } else if (Text.equals(kind_text, "fra")) {
            kind = InstrumentKind.Fra;
        } else if (!Text.equals(kind_text, "swap")) {
            free(cast<*void>(insts));
            Reply.error(res, 422, "instrument type must be deposit, fra or swap");
            return false;
        }
        local maturity: float = p.body.getNum(cur, "maturity", -1.0);
        local rate: float = p.body.getNum(cur, "rate", -100.0);
        if (!((maturity > 0.0) && (maturity <= 100.0)) || !((rate > -0.5) && (rate < 1.0))) {
            free(cast<*void>(insts));
            Reply.error(res, 422, "instrument maturity must be in (0, 100] and rate in (-0.5, 1)");
            return false;
        }
        insts[i] = CurveInstrument { kind: kind, start: p.body.getNum(cur, "start", 0.0), maturity: maturity, rate: rate, frequency: cast<int>(p.body.getNum(cur, "frequency", 1.0)) };
        i = i + 1;
        cur = p.body.next(cur);
    }
    local err: string = nullptr;
    *out = Bootstrap.build(insts, n, interp, &err);
    free(cast<*void>(insts));
    if (err != nullptr) {
        out.destroy();
        Reply.error(res, 422, err);
        return false;
    }
    return true;
}

frame bodyIfAny(req: *Request, res: *Response, p: *Params) ret bool {
    if ((req.body_length > 0) && !p.parseBody(65536)) {
        p.reject(res);
        return false;
    }
    return true;
}

frame curveHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    if (!bodyIfAny(req, res, &p)) {
        return;
    }
    local points: int = p.integer("points", 30, 2, 500);
    local fit: bool = p.flag("fit_nss", true);
    if (p.reject(res)) {
        return;
    }
    local curve: DiscountCurve;
    if (!curveFrom(&p, res, &curve)) {
        return;
    }
    local w: JsonWriter = JsonWriter.new(4096);
    w.precision = 10;
    w.beginObject();
    w.key("pillars").beginArray();
    loop (local i: int = 0; i < curve.n; i = i + 1) {
        w.beginObject();
        w.fieldNum("t", curve.times[i]);
        w.fieldNum("zero", curve.zeros[i]);
        w.fieldNum("discount", curve.discount(curve.times[i]));
        w.endObject();
    }
    w.endArray();
    local last: float = curve.times[curve.n - 1];
    w.key("grid").beginArray();
    loop (local k: int = 0; k < points; k = k + 1) {
        local t: float = 0.1 + (((last - 0.1) * cast<float>(k)) / cast<float>(points - 1));
        w.beginObject();
        w.fieldNum("t", t);
        w.fieldNum("zero", curve.zero(t));
        w.fieldNum("forward_1y", curve.forward(t, t + 1.0));
        w.endObject();
    }
    w.endArray();
    w.key("par_swaps").beginObject();
    w.fieldNum("2y", curve.parRate(2.0, 1));
    w.fieldNum("5y", curve.parRate(5.0, 1));
    w.fieldNum("10y", curve.parRate(10.0, 1));
    w.fieldNum("30y", curve.parRate(30.0, 1));
    w.endObject();
    if (fit) {
        local ns: NelsonSiegel = NelsonSiegel.fit(curve.times, curve.zeros, curve.n);
        w.key("nelson_siegel_svensson").beginObject();
        w.fieldNum("beta0", ns.beta0);
        w.fieldNum("beta1", ns.beta1);
        w.fieldNum("beta2", ns.beta2);
        w.fieldNum("beta3", ns.beta3);
        w.fieldNum("tau1", ns.tau1);
        w.fieldNum("tau2", ns.tau2);
        w.fieldNum("rmse", ns.rmse);
        w.fieldInt("iterations", cast<long>(ns.iterations));
        w.endObject();
    }
    w.endObject();
    curve.destroy();
    Reply.ok(res, &w);
    w.destroy();
}

frame bondHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    if (!bodyIfAny(req, res, &p)) {
        return;
    }
    local face: float = p.num("face", 100.0, 0.01, 1000000000.0);
    local coupon: float = p.requiredNum("coupon", 0.0, 1.0);
    local maturity: float = p.requiredNum("maturity", 0.01, 100.0);
    local frequency: int = p.integer("frequency", 2, 1, 12);
    local accrual: float = p.num("accrual", 0.0, 0.0, 0.9999);
    local has_yield: bool = p.present("yield");
    local has_price: bool = p.present("price");
    local yield: float = p.num("yield", 0.04, -0.5, 2.0);
    local price: float = p.num("price", 100.0, 0.0001, 100000000000.0);
    if (!has_yield && !has_price) {
        p.fail("yield", "give yield or price");
    }
    if (p.reject(res)) {
        return;
    }
    local b: Bond = Bond.new(face, coupon, maturity, frequency);
    b.accrual = accrual;
    if (!has_yield) {
        local r: RootResult = b.yieldFromPrice(price);
        if (!r.converged) {
            Reply.error(res, 422, "no yield reproduces this price");
            return;
        }
        yield = r.x;
    }
    local m: BondMetrics = b.metrics(yield);
    local curve: DiscountCurve = defaultCurve(Interp.LogLinearDiscount);
    local w: JsonWriter = JsonWriter.new(512);
    w.precision = 10;
    w.beginObject();
    w.fieldNum("dirty_price", m.price);
    w.fieldNum("clean_price", m.clean);
    w.fieldNum("accrued", m.accrued);
    w.fieldNum("yield", m.yield);
    w.fieldNum("macaulay_duration", m.macaulay);
    w.fieldNum("modified_duration", m.modified);
    w.fieldNum("convexity", m.convexity);
    w.fieldNum("dv01", m.dv01);
    w.fieldNum("estimate_100bp_up", Bond.priceChange(&m, 0.01));
    w.fieldNum("exact_100bp_up", b.priceFromYield(yield + 0.01) - m.price);
    w.fieldNum("z_spread_vs_default_curve", b.zSpread(&curve, m.price));
    w.fieldInt("cashflows", cast<long>(b.periods()));
    w.endObject();
    curve.destroy();
    Reply.ok(res, &w);
    w.destroy();
}

frame swapHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    if (!bodyIfAny(req, res, &p)) {
        return;
    }
    local notional: float = p.num("notional", 10000000.0, 1.0, 1000000000000.0);
    local maturity: float = p.requiredNum("maturity", 0.5, 50.0);
    local frequency: int = p.integer("frequency", 1, 1, 12);
    local pay_fixed: bool = p.flag("pay_fixed", true);
    local has_rate: bool = p.present("fixed_rate");
    local fixed: float = p.num("fixed_rate", 0.0, -0.5, 1.0);
    if (p.reject(res)) {
        return;
    }
    local curve: DiscountCurve;
    if (!curveFrom(&p, res, &curve)) {
        return;
    }
    local s: Swap = Swap { notional: notional, fixed_rate: has_rate ? fixed : curve.parRate(maturity, frequency), maturity: maturity, frequency: frequency, pay_fixed: pay_fixed };
    local m: SwapMetrics = s.value(&curve);
    local deltas: *float = cast<*float>(malloc(cast<long>(curve.n) * sizeof(float)));
    s.keyRateDeltas(&curve, deltas);
    local w: JsonWriter = JsonWriter.new(1024);
    w.precision = 10;
    w.beginObject();
    w.fieldNum("fixed_rate", s.fixed_rate);
    w.fieldNum("par_rate", m.par_rate);
    w.fieldNum("npv", m.npv);
    w.fieldNum("fixed_leg", m.fixed_leg);
    w.fieldNum("float_leg", m.float_leg);
    w.fieldNum("annuity", m.annuity);
    w.fieldNum("pv01", m.pv01);
    w.key("key_rate_deltas").beginArray();
    loop (local i: int = 0; i < curve.n; i = i + 1) {
        w.beginObject();
        w.fieldNum("pillar", curve.times[i]);
        w.fieldNum("delta_1bp", deltas[i]);
        w.endObject();
    }
    w.endArray();
    w.endObject();
    free(cast<*void>(deltas));
    curve.destroy();
    Reply.ok(res, &w);
    w.destroy();
}

frame capHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    if (!bodyIfAny(req, res, &p)) {
        return;
    }
    local maturity: float = p.requiredNum("maturity", 0.25, 30.0);
    local frequency: int = p.integer("frequency", 4, 1, 12);
    local strike: float = p.requiredNum("strike", 0.0001, 1.0);
    local vol: float = p.num("vol", 0.25, 0.001, 5.0);
    local notional: float = p.num("notional", 1000000.0, 1.0, 1000000000000.0);
    if (p.reject(res)) {
        return;
    }
    local curve: DiscountCurve;
    if (!curveFrom(&p, res, &curve)) {
        return;
    }
    local cap: float = CapFloor.price(&curve, maturity, frequency, strike, vol, true, notional);
    local floor: float = CapFloor.price(&curve, maturity, frequency, strike, vol, false, notional);
    # Cap - floor = payer swap on the same schedule (put-call parity).
    local dt: float = 1.0 / cast<float>(frequency);
    local swap_value: float = 0.0;
    local t: float = dt;
    loop (t <= (maturity + 0.0000001)) {
        swap_value = swap_value + (notional * dt * curve.discount(t) * (curve.simpleForward(t - dt, t) - strike));
        t = t + dt;
    }
    local w: JsonWriter = JsonWriter.new(256);
    w.precision = 10;
    w.beginObject();
    w.fieldNum("cap", cap);
    w.fieldNum("floor", floor);
    w.fieldNum("cap_minus_floor", cap - floor);
    w.fieldNum("forward_swap_value", swap_value);
    w.endObject();
    curve.destroy();
    Reply.ok(res, &w);
    w.destroy();
}

frame swaptionHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    if (!bodyIfAny(req, res, &p)) {
        return;
    }
    local expiry: float = p.requiredNum("expiry", 0.01, 30.0);
    local tenor: float = p.requiredNum("tenor", 0.25, 30.0);
    local frequency: int = p.integer("frequency", 1, 1, 12);
    local vol: float = p.num("vol", 0.2, 0.001, 5.0);
    local notional: float = p.num("notional", 1000000.0, 1.0, 1000000000000.0);
    local has_strike: bool = p.present("strike");
    local strike: float = p.num("strike", 0.04, 0.0001, 1.0);
    if (p.reject(res)) {
        return;
    }
    local curve: DiscountCurve;
    if (!curveFrom(&p, res, &curve)) {
        return;
    }
    local annuity: float = curve.annuity(expiry, expiry + tenor, frequency);
    local fwd: float = (curve.discount(expiry) - curve.discount(expiry + tenor)) / annuity;
    if (!has_strike) {
        strike = fwd;
    }
    local payer: float = CapFloor.swaption(&curve, expiry, tenor, frequency, strike, vol, true, notional);
    local receiver: float = CapFloor.swaption(&curve, expiry, tenor, frequency, strike, vol, false, notional);
    local w: JsonWriter = JsonWriter.new(256);
    w.precision = 10;
    w.beginObject();
    w.fieldNum("forward_swap_rate", fwd);
    w.fieldNum("strike", strike);
    w.fieldNum("annuity", annuity);
    w.fieldNum("payer", payer);
    w.fieldNum("receiver", receiver);
    w.fieldNum("parity_residual", payer - receiver - (notional * annuity * (fwd - strike)));
    w.endObject();
    curve.destroy();
    Reply.ok(res, &w);
    w.destroy();
}

global short_models: string[3] = ["vasicek", "cir", "hull_white"];

frame shortRateHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local model: string = p.oneOf("model", "vasicek", &short_models[0], 3);
    local r0: float = p.num("r0", 0.04, -0.2, 1.0);
    local a: float = p.num("a", 0.1, 0.001, 10.0);
    local b: float = p.num("b", 0.05, -0.2, 1.0);
    local sigma: float = p.num("sigma", 0.01, 0.0001, 1.0);
    local expiry: float = p.num("expiry", 1.0, 0.01, 30.0);
    local maturity: float = p.num("maturity", 5.0, 0.02, 50.0);
    local strike: float = p.num("strike", 0.85, 0.0001, 2.0);
    local steps: int = p.integer("steps", 200, 10, 2000);
    if (p.ok() && (maturity <= expiry)) {
        p.fail("maturity", "must be after expiry");
    }
    if (p.reject(res)) {
        return;
    }
    local w: JsonWriter = JsonWriter.new(1024);
    w.precision = 10;
    w.beginObject();
    w.fieldStr("model", model);
    if (Text.equals(model, "hull_white")) {
        local curve: DiscountCurve = defaultCurve(Interp.LogLinearDiscount);
        local bond: float = 0.0;
        local tree: float = ShortRate.hullWhiteTree(&curve, a, sigma, maturity, steps, expiry, strike, &bond);
        w.fieldNum("tree_bond", bond);
        w.fieldNum("curve_bond", curve.discount(maturity));
        w.fieldNum("tree_option", tree);
        w.fieldNum("jamshidian_option", ShortRate.hullWhiteBondOption(&curve, a, sigma, expiry, maturity, strike));
        curve.destroy();
    } else {
        w.key("zero_curve").beginArray();
        local tenors: float[8] = [0.25, 0.5, 1.0, 2.0, 5.0, 10.0, 20.0, 30.0];
        loop (local i: int = 0; i < 8; i = i + 1) {
            local price: float = Text.equals(model, "cir") ? ShortRate.cirBond(r0, a, b, sigma, tenors[i]) : ShortRate.vasicekBond(r0, a, b, sigma, tenors[i]);
            w.beginObject();
            w.fieldNum("t", tenors[i]);
            w.fieldNum("price", price);
            w.fieldNum("zero", ShortRate.zeroRate(price, tenors[i]));
            w.endObject();
        }
        w.endArray();
        if (Text.equals(model, "cir")) {
            w.fieldBool("feller_condition", (2.0 * a * b) > (sigma * sigma));
        }
    }
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}
