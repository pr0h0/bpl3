# Time-series model endpoints over stored bar series.

import [Request], [Response] from "bpl-express";
import malloc, free from "std/c.bpl";
import [Math] from "std/math.bpl";
import [JsonWriter] from "../core/json_writer.bpl";
import [Text] from "../core/text.bpl";
import [Clock] from "../core/clock.bpl";
import [AppState], appState from "./state.bpl";
import [Reply] from "./respond.bpl";
import [Params] from "./params.bpl";
import [SeriesEntry] from "../series/store.bpl";
import [Garch], [GarchKind], [GarchFit] from "../tsa/garch.bpl";
import [Arima], [ArmaFit], [UnitRoot] from "../tsa/arima.bpl";
import [LocalLevel], [DynamicHedge], [Cointegration], [CointegrationResult] from "../tsa/kalman.bpl";

export garchHandler;
export arimaHandler;
export stationarityHandler;
export kalmanHandler;
export pairHandler;

global garch_kinds: string[3] = ["garch", "gjr", "egarch"];

# Log returns of a symbol's closes; returns the count, or -1 after replying.
frame logReturns(_req: *Request, res: *Response, name: string, out: **float) ret int {
    local s: *AppState = appState();
    local e: *SeriesEntry = s.series.find(name);
    if (e == nullptr) {
        Reply.notFound(res, "no series for symbol");
        return -1;
    }
    local n: int = e.bars.len - 1;
    if (n < 30) {
        Reply.error(res, 422, "need at least 31 bars");
        return -1;
    }
    local r: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    loop (local i: int = 0; i < n; i = i + 1) {
        r[i] = Math.log(e.bars.close[i + 1] / e.bars.close[i]);
    }
    *out = r;
    return n;
}

frame closes(name: string, out: **float) ret int {
    local s: *AppState = appState();
    local e: *SeriesEntry = s.series.find(name);
    if (e == nullptr) {
        return -1;
    }
    *out = e.bars.close;
    return e.bars.len;
}

frame garchHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local symbol: string = p.path("symbol");
    local kind_name: string = p.oneOf("model", "garch", &garch_kinds[0], 3);
    local horizon: int = p.integer("horizon", 10, 1, 250);
    local annual: float = p.num("periods_per_year", 252.0, 1.0, 100000.0);
    if (p.reject(res)) {
        return;
    }
    local r: *float = nullptr;
    local n: int = logReturns(req, res, symbol, &r);
    if (n < 0) {
        return;
    }
    local kind: GarchKind = GarchKind.Garch;
    if (Text.equals(kind_name, "gjr")) {
        kind = GarchKind.Gjr;
    } else if (Text.equals(kind_name, "egarch")) {
        kind = GarchKind.Egarch;
    }
    local started: long = Clock.nowNs();
    local fit: GarchFit = Garch.fit(kind, r, n);
    local fc: *float = cast<*float>(malloc(cast<long>(horizon) * sizeof(float)));
    Garch.forecast(&fit, r, n, horizon, fc);
    local w: JsonWriter = JsonWriter.new(1024);
    w.precision = 10;
    w.beginObject();
    w.fieldStr("model", kind_name);
    w.fieldInt("observations", cast<long>(n));
    w.fieldNum("mu", fit.mu);
    w.fieldNum("omega", fit.omega);
    w.fieldNum("alpha", fit.alpha);
    w.fieldNum("beta", fit.beta);
    w.fieldNum("gamma", fit.gamma);
    w.fieldNum("persistence", fit.persistence);
    w.fieldNum("long_run_vol_annual", fit.long_run_vol * Math.sqrt(annual));
    w.fieldNum("log_likelihood", fit.log_likelihood);
    w.fieldNum("aic", fit.aic);
    w.fieldNum("bic", fit.bic);
    w.fieldBool("converged", fit.converged);
    w.key("vol_forecast_annual").beginArray();
    loop (local k: int = 0; k < horizon; k = k + 1) {
        w.num(Math.sqrt(fc[k] * annual));
    }
    w.endArray();
    w.fieldFixed("elapsed_ms", Clock.elapsedMs(started), 3);
    w.endObject();
    free(cast<*void>(r));
    free(cast<*void>(fc));
    Reply.ok(res, &w);
    w.destroy();
}

frame arimaHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local symbol: string = p.path("symbol");
    local order_p: int = p.integer("p", 1, 0, 5);
    local order_d: int = p.integer("d", 1, 0, 2);
    local order_q: int = p.integer("q", 1, 0, 5);
    local horizon: int = p.integer("horizon", 10, 1, 250);
    local auto: bool = p.flag("auto", false);
    if (p.ok() && ((order_p + order_q) == 0)) {
        p.fail("p", "p + q must be at least 1");
    }
    if (p.reject(res)) {
        return;
    }
    local x: *float = nullptr;
    local n: int = closes(symbol, &x);
    if (n < 0) {
        Reply.notFound(res, "no series for symbol");
        return;
    }
    if (n < 40) {
        Reply.error(res, 422, "need at least 40 bars");
        return;
    }
    local started: long = Clock.nowNs();
    if (auto) {
        Arima.selectOrder(x, n, order_d, 3, 3, &order_p, &order_q);
    }
    local fit: ArmaFit = Arima.fit(x, n, order_p, order_d, order_q);
    local fc: *float = cast<*float>(malloc(cast<long>(horizon) * sizeof(float)));
    Arima.forecast(&fit, x, n, horizon, fc);
    local w: JsonWriter = JsonWriter.new(1024);
    w.precision = 10;
    w.beginObject();
    w.key("order").beginArray().integer(cast<long>(order_p)).integer(cast<long>(order_d)).integer(cast<long>(order_q)).endArray();
    w.fieldNum("mean", fit.mean);
    w.fieldNumArray("ar", &fit.phi[0], fit.p);
    w.fieldNumArray("ma", &fit.theta[0], fit.q);
    w.fieldNum("sigma2", fit.sigma2);
    w.fieldNum("aic", fit.aic);
    w.fieldNum("bic", fit.bic);
    w.fieldNumArray("forecast", fc, horizon);
    w.fieldFixed("elapsed_ms", Clock.elapsedMs(started), 3);
    w.endObject();
    free(cast<*void>(fc));
    Reply.ok(res, &w);
    w.destroy();
}

frame writeRoot(w: *JsonWriter, name: string, u: *UnitRoot) {
    w.key(name).beginObject();
    w.fieldNum("statistic", u.statistic);
    w.fieldInt("lags", cast<long>(u.lags));
    w.fieldNum("critical_5", u.critical_5);
    w.fieldBool("reject_5", u.reject_5);
    w.endObject();
}

frame stationarityHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local symbol: string = p.path("symbol");
    local lags: int = p.integer("lags", 2, 0, 30);
    if (p.reject(res)) {
        return;
    }
    local x: *float = nullptr;
    local n: int = closes(symbol, &x);
    if (n < 0) {
        Reply.notFound(res, "no series for symbol");
        return;
    }
    if (n < (lags + 20)) {
        Reply.error(res, 422, "not enough bars for these lags");
        return;
    }
    local r: *float = nullptr;
    local m: int = logReturns(req, res, symbol, &r);
    if (m < 0) {
        return;
    }
    local adf_p: UnitRoot = Arima.adf(x, n, lags);
    local adf_r: UnitRoot = Arima.adf(r, m, lags);
    local kpss_p: UnitRoot = Arima.kpss(x, n, 12);
    local kpss_r: UnitRoot = Arima.kpss(r, m, 12);
    local acf: float[11];
    local pacf: float[11];
    Arima.acf(r, m, 10, &acf[0]);
    Arima.pacf(r, m, 10, &pacf[0]);
    local w: JsonWriter = JsonWriter.new(1024);
    w.precision = 8;
    w.beginObject();
    writeRoot(&w, "adf_prices", &adf_p);
    writeRoot(&w, "adf_returns", &adf_r);
    writeRoot(&w, "kpss_prices", &kpss_p);
    writeRoot(&w, "kpss_returns", &kpss_r);
    w.fieldNumArray("return_acf", &acf[0], 11);
    w.fieldNumArray("return_pacf", &pacf[0], 11);
    w.endObject();
    free(cast<*void>(r));
    Reply.ok(res, &w);
    w.destroy();
}

frame kalmanHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local symbol: string = p.path("symbol");
    local tail: int = p.integer("tail", 20, 1, 10000);
    local auto: bool = p.flag("auto", true);
    local q: float = p.num("q", 0.01, 0.000001, 1000.0);
    if (p.reject(res)) {
        return;
    }
    local x: *float = nullptr;
    local n: int = closes(symbol, &x);
    if (n < 0) {
        Reply.notFound(res, "no series for symbol");
        return;
    }
    if (n < 10) {
        Reply.error(res, 422, "need at least 10 bars");
        return;
    }
    # Observation variance from first differences.
    local d: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    loop (local i: int = 1; i < n; i = i + 1) {
        d[i - 1] = x[i] - x[i - 1];
    }
    local obs_var: float = 0.0;
    loop (local i: int = 0; i < (n - 1); i = i + 1) {
        obs_var = obs_var + (d[i] * d[i]);
    }
    obs_var = obs_var / cast<float>(n - 1) / 2.0;
    if (auto) {
        LocalLevel.tune(x, n, obs_var, &q);
    }
    local filtered: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    local smoothed: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    local ll: float = LocalLevel.filter(x, n, obs_var, obs_var * q, filtered, smoothed);
    local start: int = (n - tail) < 0 ? 0 : n - tail;
    local w: JsonWriter = JsonWriter.new(1024 + (tail * 64));
    w.precision = 10;
    w.beginObject();
    w.fieldNum("signal_to_noise", q);
    w.fieldNum("log_likelihood", ll);
    w.fieldNumArray("filtered", filtered + start, n - start);
    w.fieldNumArray("smoothed", smoothed + start, n - start);
    w.endObject();
    free(cast<*void>(d));
    free(cast<*void>(filtered));
    free(cast<*void>(smoothed));
    Reply.ok(res, &w);
    w.destroy();
}

# Pairs analysis: Engle-Granger cointegration and a Kalman hedge ratio.
frame pairHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local a_name: string = p.symbol("a");
    local b_name: string = p.symbol("b");
    local delta: float = p.num("delta", 0.0001, 0.0000001, 0.5);
    if (p.reject(res)) {
        return;
    }
    local ya: *float = nullptr;
    local xb: *float = nullptr;
    local na: int = closes(a_name, &ya);
    local nb: int = closes(b_name, &xb);
    if ((na < 0) || (nb < 0)) {
        Reply.notFound(res, "no series for one of the symbols");
        return;
    }
    local n: int = na < nb ? na : nb;
    if (n < 40) {
        Reply.error(res, 422, "need at least 40 aligned bars");
        return;
    }
    local y: *float = ya + (na - n);
    local x: *float = xb + (nb - n);
    local r: CointegrationResult = Cointegration.engleGranger(y, x, n, 1);
    local alpha: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    local beta: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    local err: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    DynamicHedge.run(y, x, n, delta, (r.spread_std * r.spread_std) + 0.000001, alpha, beta, err);
    local w: JsonWriter = JsonWriter.new(1024);
    w.precision = 10;
    w.beginObject();
    w.fieldStr("dependent", a_name);
    w.fieldStr("independent", b_name);
    w.fieldInt("bars", cast<long>(n));
    w.fieldNum("hedge_ratio", r.hedge_ratio);
    w.fieldNum("intercept", r.intercept);
    w.fieldNum("r2", r.r2);
    writeRoot(&w, "engle_granger", &r.adf);
    w.fieldNum("half_life", r.half_life);
    w.fieldNum("spread_zscore", r.zscore);
    w.fieldNum("kalman_hedge_ratio", beta[n - 1]);
    w.fieldNum("kalman_intercept", alpha[n - 1]);
    local signal: string = "flat";
    if (r.adf.reject_5 && (r.zscore > 2.0)) {
        signal = "short_spread";
    } else if (r.adf.reject_5 && (r.zscore < -2.0)) {
        signal = "long_spread";
    }
    w.fieldStr("signal", signal);
    w.endObject();
    free(cast<*void>(alpha));
    free(cast<*void>(beta));
    free(cast<*void>(err));
    Reply.ok(res, &w);
    w.destroy();
}
