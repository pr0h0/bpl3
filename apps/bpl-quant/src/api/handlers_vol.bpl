# Volatility endpoints: Fourier pricing, Carr-Madan grids, SABR and SVI
# calibration, surface queries and local volatility.

import [Request], [Response] from "bpl-express";
import malloc, free from "std/c.bpl";
import [Math] from "std/math.bpl";
import [JsonWriter] from "../core/json_writer.bpl";
import [JsonKind] from "../core/json_doc.bpl";
import [Text] from "../core/text.bpl";
import [Clock] from "../core/clock.bpl";
import [Reply] from "./respond.bpl";
import [Params] from "./params.bpl";
import [OptionSpec], [OptionKind], [BlackScholes] from "../quant/black_scholes.bpl";
import [ImpliedVol], [IvResult] from "../quant/implied_vol.bpl";
import [CharFn], [FourierPricer], [HestonModel], [VarianceGamma] from "../quant/fourier.bpl";
import [Sabr], [Svi], [VolSurface] from "../quant/volsurface.bpl";

export fourierHandler;
export carrMadanHandler;
export sabrHandler;
export sviHandler;
export surfaceHandler;

global cf_models: string[3] = ["heston", "variance_gamma", "black_scholes"];

frame modelFrom(p: *Params, out: *CharFn) ret string {
    local name: string = p.oneOf("model", "heston", &cf_models[0], 3);
    if (Text.equals(name, "variance_gamma")) {
        *out = CharFn.VG(VarianceGamma { sigma: p.num("sigma", 0.2, 0.001, 5.0), nu: p.num("nu", 0.2, 0.001, 10.0), theta: p.num("theta", -0.1, -2.0, 2.0) });
    } else if (Text.equals(name, "black_scholes")) {
        *out = CharFn.BlackScholes(p.num("vol", 0.2, 0.001, 5.0));
    } else {
        *out = CharFn.Heston(HestonModel { v0: p.num("v0", 0.04, 0.0001, 4.0), kappa: p.num("kappa", 2.0, 0.01, 50.0), theta: p.num("theta", 0.04, 0.0001, 4.0), xi: p.num("xi", 0.3, 0.001, 5.0), rho: p.num("rho", -0.7, -0.999, 0.999) });
    }
    return name;
}

frame fourierHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    if ((req.body_length > 0) && !p.parseBody(65536)) {
        p.reject(res);
        return;
    }
    local model: CharFn = CharFn.BlackScholes(0.2);
    local name: string = modelFrom(&p, &model);
    local spot: float = p.requiredNum("spot", 0.0001, 100000000.0);
    local strike: float = p.requiredNum("strike", 0.0001, 100000000.0);
    local rate: float = p.num("rate", 0.0, -1.0, 1.0);
    local dividend: float = p.num("dividend", 0.0, -1.0, 1.0);
    local expiry: float = p.requiredNum("expiry", 0.001, 30.0);
    local is_put: bool = Text.equals(p.str("type", "call"), "put");
    if (p.reject(res)) {
        return;
    }
    local started: long = Clock.nowNs();
    local s: OptionSpec = OptionSpec.new(is_put ? OptionKind.Put : OptionKind.Call, spot, strike, rate, dividend, 0.2, expiry);
    local price: float = FourierPricer.price(&model, &s, 200.0, 100);
    local iv: IvResult = ImpliedVol.solve(&s, price);
    local w: JsonWriter = JsonWriter.new(256);
    w.precision = 10;
    w.beginObject();
    w.fieldStr("model", name);
    w.fieldNum("price", price);
    w.fieldNum("implied_vol", iv.ok ? iv.vol : 0.0 / 0.0);
    w.fieldFixed("elapsed_ms", Clock.elapsedMs(started), 3);
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

frame carrMadanHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    local model: CharFn = CharFn.BlackScholes(0.2);
    local name: string = modelFrom(&p, &model);
    local spot: float = p.requiredNum("spot", 0.0001, 100000000.0);
    local rate: float = p.num("rate", 0.0, -1.0, 1.0);
    local dividend: float = p.num("dividend", 0.0, -1.0, 1.0);
    local expiry: float = p.requiredNum("expiry", 0.001, 30.0);
    local log2n: int = p.integer("log2n", 12, 6, 16);
    local eta: float = p.num("eta", 0.25, 0.01, 2.0);
    local alpha: float = p.num("alpha", 1.5, 0.1, 10.0);
    local width: float = p.num("width", 0.5, 0.01, 3.0);
    if (p.reject(res)) {
        return;
    }
    local n: int = 1 << log2n;
    local ks: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    local ps: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    local started: long = Clock.nowNs();
    local lambda: float = FourierPricer.carrMadan(&model, spot, rate, dividend, expiry, alpha, n, eta, ks, ps);
    local ms: float = Clock.elapsedMs(started);
    local w: JsonWriter = JsonWriter.new(8192);
    w.precision = 8;
    w.beginObject();
    w.fieldStr("model", name);
    w.fieldInt("grid_points", cast<long>(n));
    w.fieldNum("log_strike_spacing", lambda);
    w.fieldFixed("fft_ms", ms, 3);
    w.key("calls").beginArray();
    local lo: float = spot * Math.exp(-width);
    local hi: float = spot * Math.exp(width);
    loop (local i: int = 0; i < n; i = i + 1) {
        if ((ks[i] >= lo) && (ks[i] <= hi)) {
            w.beginArray().num(ks[i]).num(ps[i]).endArray();
        }
    }
    w.endArray();
    w.endObject();
    free(cast<*void>(ks));
    free(cast<*void>(ps));
    Reply.ok(res, &w);
    w.destroy();
}

# Reads parallel arrays {strikes: [...], vols: [...]} from the body.
frame readSmile(p: *Params, res: *Response, strikes: *float, vols: *float, max: int) ret int {
    local nk: int = p.body.numbers(p.body.get(p.body.root(), "strikes"), strikes, max);
    local nv: int = p.body.numbers(p.body.get(p.body.root(), "vols"), vols, max);
    if ((nk < 3) || (nk != nv)) {
        Reply.error(res, 422, "strikes and vols must be numeric arrays of equal length (3-64)");
        return -1;
    }
    loop (local i: int = 0; i < nk; i = i + 1) {
        if (!(strikes[i] > 0.0) || !(vols[i] > 0.0) || (vols[i] > 10.0)) {
            Reply.error(res, 422, "strikes and vols must be positive");
            return -1;
        }
    }
    return nk;
}

frame sabrHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    if (!p.parseBody(65536)) {
        p.reject(res);
        return;
    }
    local fwd: float = p.requiredNum("forward", 0.000001, 100000000.0);
    local expiry: float = p.requiredNum("expiry", 0.001, 30.0);
    local beta: float = p.num("beta", 0.5, 0.0, 1.0);
    if (p.reject(res)) {
        return;
    }
    local strikes: float[64];
    local vols: float[64];
    local n: int = readSmile(&p, res, &strikes[0], &vols[0], 64);
    if (n < 0) {
        return;
    }
    local started: long = Clock.nowNs();
    local fit: Sabr = Sabr.calibrate(fwd, expiry, beta, &strikes[0], &vols[0], n);
    local w: JsonWriter = JsonWriter.new(1024);
    w.precision = 10;
    w.beginObject();
    w.fieldNum("alpha", fit.alpha);
    w.fieldNum("beta", fit.beta);
    w.fieldNum("rho", fit.rho);
    w.fieldNum("nu", fit.nu);
    w.fieldNum("rmse", fit.rmse);
    w.fieldNum("atm_vol", fit.impliedVol(fwd, fwd, expiry));
    w.key("fitted").beginArray();
    loop (local i: int = 0; i < n; i = i + 1) {
        w.beginArray().num(strikes[i]).num(vols[i]).num(fit.impliedVol(fwd, strikes[i], expiry)).endArray();
    }
    w.endArray();
    w.fieldFixed("elapsed_ms", Clock.elapsedMs(started), 3);
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

frame sviHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    if (!p.parseBody(65536)) {
        p.reject(res);
        return;
    }
    local fwd: float = p.requiredNum("forward", 0.000001, 100000000.0);
    local expiry: float = p.requiredNum("expiry", 0.001, 30.0);
    if (p.reject(res)) {
        return;
    }
    local strikes: float[64];
    local vols: float[64];
    local n: int = readSmile(&p, res, &strikes[0], &vols[0], 64);
    if (n < 0) {
        return;
    }
    local ks: float[64];
    local ws: float[64];
    loop (local i: int = 0; i < n; i = i + 1) {
        ks[i] = Math.log(strikes[i] / fwd);
        ws[i] = vols[i] * vols[i] * expiry;
    }
    local fit: Svi = Svi.calibrate(&ks[0], &ws[0], n);
    local w: JsonWriter = JsonWriter.new(1024);
    w.precision = 10;
    w.beginObject();
    w.fieldNum("a", fit.a);
    w.fieldNum("b", fit.b);
    w.fieldNum("rho", fit.rho);
    w.fieldNum("m", fit.m);
    w.fieldNum("sigma", fit.sigma);
    w.fieldNum("rmse_total_variance", fit.rmse);
    w.fieldBool("butterfly_arbitrage_free", fit.arbitrageFree(ks[0] - 0.5, ks[n - 1] + 0.5, 201));
    w.key("fitted").beginArray();
    loop (local i: int = 0; i < n; i = i + 1) {
        w.beginArray().num(strikes[i]).num(vols[i]).num(fit.impliedVol(ks[i], expiry)).endArray();
    }
    w.endArray();
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

# A demonstration surface from three SVI slices; queries vol, price and local vol.
frame surfaceHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local spot: float = p.num("spot", 100.0, 0.0001, 100000000.0);
    local rate: float = p.num("rate", 0.02, -1.0, 1.0);
    local strike: float = p.num("strike", spot, 0.0001, 100000000.0);
    local expiry: float = p.num("expiry", 1.0, 0.01, 5.0);
    if (p.reject(res)) {
        return;
    }
    local surface: VolSurface = VolSurface.new(3, spot, rate, 0.0);
    surface.addSlice(0.5, Svi { a: 0.01, b: 0.08, rho: -0.4, m: 0.0, sigma: 0.15, rmse: 0.0 });
    surface.addSlice(1.0, Svi { a: 0.025, b: 0.1, rho: -0.4, m: 0.0, sigma: 0.2, rmse: 0.0 });
    surface.addSlice(2.0, Svi { a: 0.055, b: 0.12, rho: -0.35, m: 0.0, sigma: 0.25, rmse: 0.0 });
    local w: JsonWriter = JsonWriter.new(2048);
    w.precision = 10;
    w.beginObject();
    w.fieldNum("implied_vol", surface.impliedVol(strike, expiry));
    w.fieldNum("local_vol", surface.localVol(strike, expiry));
    w.fieldNum("call", surface.price(true, strike, expiry));
    w.fieldNum("put", surface.price(false, strike, expiry));
    w.fieldBool("calendar_arbitrage_free", surface.calendarFree(-1.0, 1.0, 41));
    w.key("grid").beginArray();
    local ts: float[4] = [0.25, 0.5, 1.0, 2.0];
    loop (local j: int = 0; j < 4; j = j + 1) {
        w.beginObject();
        w.fieldNum("expiry", ts[j]);
        w.key("vols").beginArray();
        loop (local i: int = 0; i < 9; i = i + 1) {
            local k: float = spot * (0.6 + (0.1 * cast<float>(i)));
            w.beginArray().num(k).num(surface.impliedVol(k, ts[j])).endArray();
        }
        w.endArray();
        w.endObject();
    }
    w.endArray();
    w.endObject();
    surface.destroy();
    Reply.ok(res, &w);
    w.destroy();
}
