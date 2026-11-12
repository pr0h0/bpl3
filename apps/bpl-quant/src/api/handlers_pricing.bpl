# Option pricing endpoints. Every endpoint accepts query parameters or a
# JSON body with the same names:
#   type=call|put spot strike rate dividend vol expiry (years)

import [Request], [Response], [HttpMethod] from "bpl-express";
import [Math] from "std/math.bpl";
import malloc, free from "std/c.bpl";
import [JsonWriter] from "../core/json_writer.bpl";
import [Text] from "../core/text.bpl";
import [Clock] from "../core/clock.bpl";
import [Reply] from "./respond.bpl";
import [Params] from "./params.bpl";
import [OptionSpec], [OptionKind], [BlackScholes], [Greeks] from "../quant/black_scholes.bpl";
import [ImpliedVol], [IvResult] from "../quant/implied_vol.bpl";
import [Lattice], [TreeResult] from "../quant/lattice.bpl";
import [MonteCarlo], [McResult], [BarrierKind], [HestonParams] from "../quant/monte_carlo.bpl";

export priceHandler;
export greeksHandler;
export impliedVolHandler;
export treeHandler;
export monteCarloHandler;
export asianHandler;
export barrierHandler;
export americanHandler;
export chainHandler;
export hestonHandler;
export jumpHandler;
export exoticHandler;

global kind_names: string[2] = ["call", "put"];

frame readSpec(p: *Params, out: *OptionSpec) {
    local kind: string = p.oneOf("type", "call", &kind_names[0], 2);
    out.kind = Text.equals(kind, "put") ? OptionKind.Put : OptionKind.Call;
    out.spot = p.requiredNum("spot", 0.0001, 100000000.0);
    out.strike = p.requiredNum("strike", 0.0001, 100000000.0);
    out.rate = p.num("rate", 0.0, -1.0, 1.0);
    out.dividend = p.num("dividend", 0.0, -1.0, 1.0);
    out.vol = p.num("vol", 0.2, 0.0001, 10.0);
    out.expiry = p.requiredNum("expiry", 0.0001, 100.0);
}

# Parses a JSON body when present, then the option spec; replies 4xx and returns false on errors.
frame prepare(req: *Request, res: *Response, p: *Params, s: *OptionSpec) ret bool {
    if (req.body_length > 0) {
        if (!p.parseBody(16384)) {
            p.reject(res);
            return false;
        }
    }
    readSpec(p, s);
    if (p.reject(res)) {
        return false;
    }
    local problem: string = s.validate();
    if (problem != nullptr) {
        Reply.error(res, 422, problem);
        return false;
    }
    return true;
}

frame writeSpec(w: *JsonWriter, s: *OptionSpec) {
    w.key("option").beginObject();
    w.fieldStr("type", s.isCall() ? "call" : "put");
    w.fieldNum("spot", s.spot);
    w.fieldNum("strike", s.strike);
    w.fieldNum("rate", s.rate);
    w.fieldNum("dividend", s.dividend);
    w.fieldNum("vol", s.vol);
    w.fieldNum("expiry", s.expiry);
    w.endObject();
}

frame writeGreeks(w: *JsonWriter, g: *Greeks) {
    w.fieldNum("price", g.price);
    w.fieldNum("delta", g.delta);
    w.fieldNum("gamma", g.gamma);
    w.fieldNum("vega", g.vega);
    w.fieldNum("theta", g.theta);
    w.fieldNum("rho", g.rho);
    w.fieldNum("vanna", g.vanna);
    w.fieldNum("volga", g.volga);
    w.fieldNum("charm", g.charm);
    w.fieldNum("speed", g.speed);
    w.fieldNum("zomma", g.zomma);
    w.fieldNum("color", g.color);
    w.fieldNum("epsilon", g.epsilon);
    w.fieldNum("lambda", g.lambda);
}

frame writeMc(w: *JsonWriter, r: *McResult, started: long) {
    w.fieldNum("price", r.price);
    w.fieldNum("stderr", r.stderr);
    w.fieldNum("ci_low", r.lower());
    w.fieldNum("ci_high", r.upper());
    w.fieldInt("paths", cast<long>(r.paths));
    w.fieldFixed("elapsed_ms", Clock.elapsedMs(started), 3);
}

frame priceHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    local s: OptionSpec = OptionSpec.new(OptionKind.Call, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
    if (!prepare(req, res, &p, &s)) {
        return;
    }
    local w: JsonWriter = JsonWriter.new(512);
    w.beginObject();
    writeSpec(&w, &s);
    w.fieldNum("price", BlackScholes.price(&s));
    w.fieldNum("d1", BlackScholes.d1(&s));
    w.fieldNum("d2", BlackScholes.d2(&s));
    w.fieldNum("parity_residual", BlackScholes.parityResidual(&s));
    w.fieldNum("digital", BlackScholes.digital(&s, 1.0));
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

frame greeksHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    local s: OptionSpec = OptionSpec.new(OptionKind.Call, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
    if (!prepare(req, res, &p, &s)) {
        return;
    }
    local g: Greeks = BlackScholes.greeks(&s);
    local w: JsonWriter = JsonWriter.new(768);
    w.beginObject();
    writeSpec(&w, &s);
    writeGreeks(&w, &g);
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

frame impliedVolHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    local s: OptionSpec = OptionSpec.new(OptionKind.Call, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
    if (!prepare(req, res, &p, &s)) {
        return;
    }
    local target: float = p.requiredNum("price", 0.0, 100000000.0);
    if (p.reject(res)) {
        return;
    }
    local r: IvResult = ImpliedVol.solve(&s, target);
    local w: JsonWriter = JsonWriter.new(256);
    w.beginObject();
    w.fieldBool("ok", r.ok);
    if (r.ok) {
        w.fieldNum("implied_vol", r.vol);
        local check: OptionSpec = s.withVol(r.vol);
        w.fieldNum("repriced", BlackScholes.price(&check));
    } else {
        w.fieldStr("error", r.error);
    }
    w.fieldInt("iterations", cast<long>(r.iterations));
    w.fieldStr("method", r.method);
    w.endObject();
    Reply.json(res, r.ok ? 200 : 422, &w);
    w.destroy();
}

global tree_models: string[4] = ["crr", "leisen_reimer", "trinomial", "crank_nicolson"];

frame treeHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    local s: OptionSpec = OptionSpec.new(OptionKind.Call, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
    if (!prepare(req, res, &p, &s)) {
        return;
    }
    local model: string = p.oneOf("model", "crr", &tree_models[0], 4);
    local steps: int = p.integer("steps", 200, 3, 5000);
    local american: bool = p.flag("american", false);
    if (p.reject(res)) {
        return;
    }
    local started: long = Clock.nowNs();
    local w: JsonWriter = JsonWriter.new(512);
    w.beginObject();
    writeSpec(&w, &s);
    w.fieldStr("model", model);
    w.fieldBool("american", american);
    if (Text.equals(model, "crank_nicolson")) {
        local grid: int = steps < 1000 ? steps : 1000;
        w.fieldNum("price", Lattice.crankNicolson(&s, grid, grid, american));
        w.fieldInt("steps", cast<long>(grid));
    } else {
        local t: TreeResult;
        if (Text.equals(model, "leisen_reimer")) {
            t = Lattice.leisenReimer(&s, steps, american);
        } else if (Text.equals(model, "trinomial")) {
            t = Lattice.trinomial(&s, steps, american);
        } else {
            t = Lattice.crr(&s, steps, american);
        }
        w.fieldNum("price", t.price);
        w.fieldNum("delta", t.delta);
        w.fieldNum("gamma", t.gamma);
        w.fieldNum("theta", t.theta);
        w.fieldInt("steps", cast<long>(t.steps));
        w.fieldInt("early_exercise_nodes", cast<long>(t.early_exercise_nodes));
    }
    w.fieldNum("black_scholes", BlackScholes.price(&s));
    w.fieldFixed("elapsed_ms", Clock.elapsedMs(started), 3);
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

frame monteCarloHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    local s: OptionSpec = OptionSpec.new(OptionKind.Call, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
    if (!prepare(req, res, &p, &s)) {
        return;
    }
    local paths: int = p.integer("paths", 20000, 100, 2000000);
    local seed: long = p.longInt("seed", 1, 0, 9223372036854775807);
    local control: bool = p.flag("control_variate", false);
    if (p.reject(res)) {
        return;
    }
    local started: long = Clock.nowNs();
    local r: McResult = control ? MonteCarlo.europeanControl(&s, paths, cast<u64>(seed)) : MonteCarlo.european(&s, paths, cast<u64>(seed));
    local w: JsonWriter = JsonWriter.new(512);
    w.beginObject();
    writeSpec(&w, &s);
    writeMc(&w, &r, started);
    w.fieldNum("black_scholes", BlackScholes.price(&s));
    w.fieldStr("variance_reduction", control ? "control_variate" : "antithetic");
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

frame asianHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    local s: OptionSpec = OptionSpec.new(OptionKind.Call, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
    if (!prepare(req, res, &p, &s)) {
        return;
    }
    local steps: int = p.integer("fixings", 12, 1, 1000);
    local paths: int = p.integer("paths", 10000, 100, 500000);
    local seed: long = p.longInt("seed", 1, 0, 9223372036854775807);
    if (p.reject(res)) {
        return;
    }
    local started: long = Clock.nowNs();
    local r: McResult = MonteCarlo.asian(&s, steps, paths, cast<u64>(seed));
    local w: JsonWriter = JsonWriter.new(512);
    w.beginObject();
    writeSpec(&w, &s);
    writeMc(&w, &r, started);
    w.fieldNum("geometric_closed_form", MonteCarlo.geometricAsianPrice(&s, steps));
    w.fieldNum("control_beta", r.control_beta);
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

global barrier_names: string[4] = ["up_and_out", "up_and_in", "down_and_out", "down_and_in"];

frame barrierHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    local s: OptionSpec = OptionSpec.new(OptionKind.Call, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
    if (!prepare(req, res, &p, &s)) {
        return;
    }
    local kind_text: string = p.oneOf("barrier_type", "up_and_out", &barrier_names[0], 4);
    local level: float = p.requiredNum("barrier", 0.0001, 100000000.0);
    local rebate: float = p.num("rebate", 0.0, 0.0, 100000000.0);
    local steps: int = p.integer("steps", 100, 1, 2000);
    local paths: int = p.integer("paths", 10000, 100, 500000);
    local seed: long = p.longInt("seed", 1, 0, 9223372036854775807);
    if (p.reject(res)) {
        return;
    }
    local kind: BarrierKind = BarrierKind.UpAndOut;
    if (Text.equals(kind_text, "up_and_in")) {
        kind = BarrierKind.UpAndIn;
    } else if (Text.equals(kind_text, "down_and_out")) {
        kind = BarrierKind.DownAndOut;
    } else if (Text.equals(kind_text, "down_and_in")) {
        kind = BarrierKind.DownAndIn;
    }
    local up: bool = (kind == BarrierKind.UpAndOut) || (kind == BarrierKind.UpAndIn);
    if ((up && (level <= s.spot)) || (!up && (level >= s.spot))) {
        Reply.error(res, 422, "barrier must be on the far side of spot for its direction");
        return;
    }
    local started: long = Clock.nowNs();
    local r: McResult = MonteCarlo.barrier(&s, kind, level, rebate, steps, paths, cast<u64>(seed));
    local w: JsonWriter = JsonWriter.new(512);
    w.beginObject();
    writeSpec(&w, &s);
    w.fieldStr("barrier_type", kind_text);
    w.fieldNum("barrier", level);
    writeMc(&w, &r, started);
    w.fieldNum("vanilla", BlackScholes.price(&s));
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

frame americanHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    local s: OptionSpec = OptionSpec.new(OptionKind.Put, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
    if (!prepare(req, res, &p, &s)) {
        return;
    }
    local paths: int = p.integer("paths", 10000, 100, 200000);
    local steps: int = p.integer("steps", 50, 2, 500);
    local seed: long = p.longInt("seed", 1, 0, 9223372036854775807);
    if (p.reject(res)) {
        return;
    }
    local started: long = Clock.nowNs();
    local tree: TreeResult = Lattice.crr(&s, 500, true);
    local euro: float = BlackScholes.price(&s);
    local lsm: McResult = MonteCarlo.longstaffSchwartz(&s, steps, paths, cast<u64>(seed));
    local w: JsonWriter = JsonWriter.new(512);
    w.beginObject();
    writeSpec(&w, &s);
    w.fieldNum("crr_500", tree.price);
    w.fieldNum("barone_adesi_whaley", Lattice.baroneAdesiWhaley(&s, euro));
    w.fieldNum("crank_nicolson", Lattice.crankNicolson(&s, 200, 200, true));
    w.fieldNum("longstaff_schwartz", lsm.price);
    w.fieldNum("longstaff_schwartz_stderr", lsm.stderr);
    w.fieldNum("european", euro);
    w.fieldNum("early_exercise_premium", tree.price - euro);
    w.fieldFixed("elapsed_ms", Clock.elapsedMs(started), 3);
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

# Option chain across strikes with a parametric smile: vol(K) = vol + skew*m + smile*m^2, m = ln(K/F).
frame chainHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    if ((req.body_length > 0) && !p.parseBody(16384)) {
        p.reject(res);
        return;
    }
    local spot: float = p.requiredNum("spot", 0.0001, 100000000.0);
    local rate: float = p.num("rate", 0.0, -1.0, 1.0);
    local dividend: float = p.num("dividend", 0.0, -1.0, 1.0);
    local vol: float = p.num("vol", 0.2, 0.001, 5.0);
    local skew: float = p.num("skew", -0.1, -5.0, 5.0);
    local smile: float = p.num("smile", 0.3, -5.0, 5.0);
    local expiry: float = p.requiredNum("expiry", 0.001, 30.0);
    local count: int = p.integer("strikes", 11, 1, 201);
    local width: float = p.num("width", 0.3, 0.01, 2.0);
    if (p.reject(res)) {
        return;
    }
    local fwd: float = spot * Math.exp((rate - dividend) * expiry);
    local w: JsonWriter = JsonWriter.new(256 + (count * 400));
    w.precision = 8;
    w.beginObject();
    w.fieldNum("forward", fwd);
    w.key("chain").beginArray();
    loop (local i: int = 0; i < count; i = i + 1) {
        local frac: float = count == 1 ? 0.0 : -width + ((2.0 * width * cast<float>(i)) / cast<float>(count - 1));
        local strike: float = spot * Math.exp(frac);
        local m: float = Math.log(strike / fwd);
        local v: float = vol + (skew * m) + (smile * m * m);
        if (v < 0.01) {
            v = 0.01;
        }
        local c: OptionSpec = OptionSpec.new(OptionKind.Call, spot, strike, rate, dividend, v, expiry);
        local pt: OptionSpec = OptionSpec.new(OptionKind.Put, spot, strike, rate, dividend, v, expiry);
        local gc: Greeks = BlackScholes.greeks(&c);
        local gp: Greeks = BlackScholes.greeks(&pt);
        w.beginObject();
        w.fieldFixed("strike", strike, 4);
        w.fieldNum("vol", v);
        w.fieldNum("call", gc.price);
        w.fieldNum("put", gp.price);
        w.fieldNum("call_delta", gc.delta);
        w.fieldNum("put_delta", gp.delta);
        w.fieldNum("gamma", gc.gamma);
        w.fieldNum("vega", gc.vega);
        local iv: IvResult = ImpliedVol.solve(&c, gc.price);
        w.fieldNum("iv_check", iv.ok ? iv.vol : 0.0 / 0.0);
        w.endObject();
    }
    w.endArray();
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

frame hestonHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    local s: OptionSpec = OptionSpec.new(OptionKind.Call, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
    if (!prepare(req, res, &p, &s)) {
        return;
    }
    local h: HestonParams;
    h.v0 = p.num("v0", 0.04, 0.0001, 4.0);
    h.kappa = p.num("kappa", 2.0, 0.01, 20.0);
    h.theta = p.num("theta", 0.04, 0.0001, 4.0);
    h.xi = p.num("xi", 0.3, 0.01, 5.0);
    h.rho = p.num("rho", -0.7, -0.99, 0.99);
    local steps: int = p.integer("steps", 100, 1, 1000);
    local paths: int = p.integer("paths", 10000, 100, 200000);
    local seed: long = p.longInt("seed", 1, 0, 9223372036854775807);
    if (p.reject(res)) {
        return;
    }
    local started: long = Clock.nowNs();
    local r: McResult = MonteCarlo.heston(&s, &h, steps, paths, cast<u64>(seed));
    local w: JsonWriter = JsonWriter.new(512);
    w.beginObject();
    writeSpec(&w, &s);
    writeMc(&w, &r, started);
    w.fieldBool("feller_condition", (2.0 * h.kappa * h.theta) > (h.xi * h.xi));
    local flat: OptionSpec = s.withVol(Math.sqrt(h.v0));
    w.fieldNum("black_scholes_at_v0", BlackScholes.price(&flat));
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

frame jumpHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    local s: OptionSpec = OptionSpec.new(OptionKind.Call, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
    if (!prepare(req, res, &p, &s)) {
        return;
    }
    local lambda: float = p.num("jump_rate", 0.5, 0.0, 50.0);
    local mean: float = p.num("jump_mean", -0.1, -2.0, 2.0);
    local jvol: float = p.num("jump_vol", 0.15, 0.0001, 2.0);
    local paths: int = p.integer("paths", 20000, 100, 1000000);
    local seed: long = p.longInt("seed", 1, 0, 9223372036854775807);
    if (p.reject(res)) {
        return;
    }
    local started: long = Clock.nowNs();
    local r: McResult = MonteCarlo.mertonJump(&s, lambda, mean, jvol, paths, cast<u64>(seed));
    local w: JsonWriter = JsonWriter.new(512);
    w.beginObject();
    writeSpec(&w, &s);
    writeMc(&w, &r, started);
    w.fieldNum("series", MonteCarlo.mertonSeries(&s, lambda, mean, jvol, 60));
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

global exotic_names: string[5] = ["lookback", "margrabe", "kirk", "digital", "asset_or_nothing"];

frame exoticHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    if ((req.body_length > 0) && !p.parseBody(16384)) {
        p.reject(res);
        return;
    }
    local kind: string = p.oneOf("kind", "lookback", &exotic_names[0], 5);
    if (p.reject(res)) {
        return;
    }
    local w: JsonWriter = JsonWriter.new(256);
    w.beginObject();
    w.fieldStr("kind", kind);
    if (Text.equals(kind, "margrabe") || Text.equals(kind, "kirk")) {
        local s1: float = p.requiredNum("spot1", 0.0001, 100000000.0);
        local s2: float = p.requiredNum("spot2", 0.0001, 100000000.0);
        local v1: float = p.num("vol1", 0.2, 0.001, 5.0);
        local v2: float = p.num("vol2", 0.2, 0.001, 5.0);
        local rho: float = p.num("rho", 0.5, -0.999, 0.999);
        local t: float = p.requiredNum("expiry", 0.001, 30.0);
        local strike: float = p.num("strike", 0.0, 0.0, 100000000.0);
        local rate: float = p.num("rate", 0.0, -1.0, 1.0);
        if (p.reject(res)) {
            w.destroy();
            return;
        }
        if (Text.equals(kind, "margrabe")) {
            w.fieldNum("price", BlackScholes.margrabe(s1, s2, 0.0, 0.0, v1, v2, rho, t));
        } else {
            w.fieldNum("price", BlackScholes.kirkSpread(s1, s2, strike, v1, v2, rho, rate, t));
        }
    } else {
        local s: OptionSpec = OptionSpec.new(OptionKind.Call, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        readSpec(&p, &s);
        local paths: int = p.integer("paths", 10000, 100, 200000);
        local cash: float = p.num("cash", 1.0, 0.0, 100000000.0);
        if (p.reject(res)) {
            w.destroy();
            return;
        }
        local problem: string = s.validate();
        if (problem != nullptr) {
            Reply.error(res, 422, problem);
            w.destroy();
            return;
        }
        if (Text.equals(kind, "lookback")) {
            local started: long = Clock.nowNs();
            local r: McResult = MonteCarlo.lookback(&s, 100, paths, cast<u64>(1));
            writeMc(&w, &r, started);
        } else if (Text.equals(kind, "digital")) {
            w.fieldNum("price", BlackScholes.digital(&s, cash));
        } else {
            w.fieldNum("price", BlackScholes.assetOrNothing(&s));
        }
    }
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}
