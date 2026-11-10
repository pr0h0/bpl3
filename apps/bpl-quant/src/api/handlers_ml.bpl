# Learning, credit and FX endpoints.

import [Request], [Response] from "bpl-express";
import malloc, free from "std/c.bpl";
import [Math] from "std/math.bpl";
import [JsonWriter] from "../core/json_writer.bpl";
import [JsonKind] from "../core/json_doc.bpl";
import [Text] from "../core/text.bpl";
import [AppState], appState from "./state.bpl";
import [Reply] from "./respond.bpl";
import [Params] from "./params.bpl";
import [SeriesEntry] from "../series/store.bpl";
import [ReturnPanel] from "../risk/covariance.bpl";
import [Pca], [PcaResult], [Ols], [OlsResult], [KMeans], [KMeansResult], [Logistic], [LogisticResult], [Bootstrap], [Kde] from "../ml/models.bpl";
import [HazardCurve], [Cds], [CdsValue], [Merton], [MertonResult], [Vasicek1F], [Fx] from "../quant/credit_fx.bpl";
import [DiscountCurve] from "../rates/curve.bpl";

export pcaHandler;
export factorHandler;
export clusterHandler;
export directionHandler;
export bootstrapHandler;
export cdsHandler;
export mertonHandler;
export portfolioLossHandler;
export fxHandler;

global const MAX_UNIVERSE: int = 32;

# Aligned log-return panel for comma-separated symbols; replies on error.
frame panelFor(res: *Response, symbols: string, lookback: int, names: *string, out: *ReturnPanel) ret bool {
    local s: *AppState = appState();
    local entries: **SeriesEntry = cast<**SeriesEntry>(malloc(cast<long>(MAX_UNIVERSE) * sizeof(*SeriesEntry)));
    local count: int = 0;
    local n: int = Text.length(symbols);
    local start: int = 0;
    loop (local i: int = 0; i <= n; i = i + 1) {
        if ((i == n) || (symbols[i] == ',')) {
            if ((i > start) && (count < MAX_UNIVERSE)) {
                local name: string = Text.copyN(cast<string>(cast<*char>(symbols) + start), i - start);
                local id: int = s.series.names.find(name);
                Text.release(name);
                if (id < 0) {
                    free(cast<*void>(entries));
                    Reply.error(res, 422, "unknown symbol in universe");
                    return false;
                }
                entries[count] = s.series.entries + id;
                names[count] = s.series.symbolAt(id);
                count = count + 1;
            }
            start = i + 1;
        }
    }
    if (count < 1) {
        free(cast<*void>(entries));
        Reply.error(res, 422, "symbols must name at least one series");
        return false;
    }
    local periods: int = lookback;
    loop (local i: int = 0; i < count; i = i + 1) {
        if ((entries[i].bars.len - 1) < periods) {
            periods = entries[i].bars.len - 1;
        }
    }
    if (periods < 10) {
        free(cast<*void>(entries));
        Reply.error(res, 422, "not enough history");
        return false;
    }
    *out = ReturnPanel.new(count, periods);
    loop (local i: int = 0; i < count; i = i + 1) {
        local base: int = entries[i].bars.len - periods - 1;
        loop (local t: int = 0; t < periods; t = t + 1) {
            out.put(i, t, Math.log(entries[i].bars.close[base + t + 1] / entries[i].bars.close[base + t]));
        }
    }
    free(cast<*void>(entries));
    return true;
}

frame pcaHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local symbols: string = p.requiredStr("symbols", 1000);
    local lookback: int = p.integer("lookback", 250, 10, 5000);
    if (p.reject(res)) {
        return;
    }
    local names: string[32];
    local panel: ReturnPanel;
    if (!panelFor(res, symbols, lookback, &names[0], &panel)) {
        return;
    }
    local r: PcaResult = Pca.fit(&panel);
    local w: JsonWriter = JsonWriter.new(4096);
    w.precision = 8;
    w.beginObject();
    w.fieldNumArray("explained", r.explained, r.assets);
    w.fieldInt("components_for_90", cast<long>(r.componentsFor(0.9)));
    w.key("loadings").beginArray();
    local shown: int = r.assets < 3 ? r.assets : 3;
    loop (local k: int = 0; k < shown; k = k + 1) {
        w.beginObject();
        loop (local i: int = 0; i < r.assets; i = i + 1) {
            w.fieldNum(names[i], r.eigen.vectors.at(i, k));
        }
        w.endObject();
    }
    w.endArray();
    w.endObject();
    r.destroy();
    panel.destroy();
    Reply.ok(res, &w);
    w.destroy();
}

# Regresses `target` returns on the factor symbols' returns (time-series factor model).
frame factorHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local target: string = p.symbol("target");
    local factors: string = p.requiredStr("factors", 1000);
    local lookback: int = p.integer("lookback", 250, 20, 5000);
    if (p.reject(res)) {
        return;
    }
    local names: string[32];
    local panel: ReturnPanel;
    local all_len: int = Text.length(target) + 1 + Text.length(factors);
    local all: string = cast<string>(malloc(cast<long>(all_len + 1)));
    loop (local i: int = 0; i < Text.length(target); i = i + 1) {
        all[i] = target[i];
    }
    all[Text.length(target)] = ',';
    loop (local i: int = 0; i < Text.length(factors); i = i + 1) {
        all[Text.length(target) + 1 + i] = factors[i];
    }
    all[all_len] = cast<char>(0);
    local ok: bool = panelFor(res, all, lookback, &names[0], &panel);
    Text.release(all);
    if (!ok) {
        return;
    }
    local m: int = panel.assets - 1;
    if (m < 1) {
        panel.destroy();
        Reply.error(res, 422, "need at least one factor");
        return;
    }
    local n: int = panel.periods;
    local x: *float = cast<*float>(malloc(cast<long>(n * m) * sizeof(float)));
    loop (local t: int = 0; t < n; t = t + 1) {
        loop (local j: int = 0; j < m; j = j + 1) {
            x[(t * m) + j] = panel.at(j + 1, t);
        }
    }
    local r: OlsResult = Ols.fit(panel.column(0), x, n, m);
    local w: JsonWriter = JsonWriter.new(2048);
    w.precision = 8;
    w.beginObject();
    w.fieldStr("target", names[0]);
    w.fieldBool("ok", r.ok);
    w.fieldNum("alpha_annual", r.beta[0] * 252.0);
    w.fieldNum("alpha_t", r.tstat[0]);
    w.key("betas").beginArray();
    loop (local j: int = 1; j < r.k; j = j + 1) {
        w.beginObject();
        w.fieldStr("factor", names[j]);
        w.fieldNum("beta", r.beta[j]);
        w.fieldNum("stderr", r.stderr[j]);
        w.fieldNum("t", r.tstat[j]);
        w.fieldNum("p", r.pvalue[j]);
        w.endObject();
    }
    w.endArray();
    w.fieldNum("r2", r.r2);
    w.fieldNum("adj_r2", r.adj_r2);
    w.fieldNum("residual_vol_annual", r.sigma * Math.sqrt(252.0));
    w.fieldNum("f_stat", r.f_stat);
    w.endObject();
    r.destroy();
    free(cast<*void>(x));
    panel.destroy();
    Reply.ok(res, &w);
    w.destroy();
}

# Clusters symbols by (annual return, annual volatility).
frame clusterHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local symbols: string = p.requiredStr("symbols", 1000);
    local k: int = p.integer("k", 2, 1, 16);
    local lookback: int = p.integer("lookback", 250, 10, 5000);
    if (p.reject(res)) {
        return;
    }
    local names: string[32];
    local panel: ReturnPanel;
    if (!panelFor(res, symbols, lookback, &names[0], &panel)) {
        return;
    }
    if (k > panel.assets) {
        panel.destroy();
        Reply.error(res, 422, "k cannot exceed the number of symbols");
        return;
    }
    local pts: *float = cast<*float>(malloc(cast<long>(panel.assets * 2) * sizeof(float)));
    loop (local i: int = 0; i < panel.assets; i = i + 1) {
        pts[i * 2] = panel.mean(i) * 252.0;
        local col: *float = panel.column(i);
        local sd: float = 0.0;
        local m: float = panel.mean(i);
        loop (local t: int = 0; t < panel.periods; t = t + 1) {
            sd = sd + ((col[t] - m) * (col[t] - m));
        }
        pts[(i * 2) + 1] = Math.sqrt((sd / cast<float>(panel.periods - 1)) * 252.0);
    }
    local r: KMeansResult = KMeans.fit(pts, panel.assets, 2, k, cast<u64>(7), 100);
    local w: JsonWriter = JsonWriter.new(1024);
    w.precision = 8;
    w.beginObject();
    w.key("assignments").beginArray();
    loop (local i: int = 0; i < panel.assets; i = i + 1) {
        w.beginObject();
        w.fieldStr("symbol", names[i]);
        w.fieldInt("cluster", cast<long>(r.labels[i]));
        w.fieldNum("return", pts[i * 2]);
        w.fieldNum("volatility", pts[(i * 2) + 1]);
        w.endObject();
    }
    w.endArray();
    w.fieldNum("inertia", r.inertia);
    w.fieldInt("iterations", cast<long>(r.iterations));
    w.endObject();
    r.destroy();
    free(cast<*void>(pts));
    panel.destroy();
    Reply.ok(res, &w);
    w.destroy();
}

# Logistic model of next-bar direction from lagged returns.
frame directionHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local symbol: string = p.path("symbol");
    local lags: int = p.integer("lags", 3, 1, 10);
    if (p.reject(res)) {
        return;
    }
    local s: *AppState = appState();
    local e: *SeriesEntry = s.series.find(symbol);
    if (e == nullptr) {
        Reply.notFound(res, "no series for symbol");
        return;
    }
    local n: int = e.bars.len - 1;
    local rows: int = n - lags;
    if (rows < 30) {
        Reply.error(res, 422, "not enough bars");
        return;
    }
    local r: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    loop (local i: int = 0; i < n; i = i + 1) {
        r[i] = Math.log(e.bars.close[i + 1] / e.bars.close[i]);
    }
    local x: *float = cast<*float>(malloc(cast<long>(rows * lags) * sizeof(float)));
    local y: *float = cast<*float>(malloc(cast<long>(rows) * sizeof(float)));
    loop (local t: int = 0; t < rows; t = t + 1) {
        loop (local j: int = 0; j < lags; j = j + 1) {
            x[(t * lags) + j] = r[(t + lags) - 1 - j] * 100.0;
        }
        y[t] = r[t + lags] > 0.0 ? 1.0 : 0.0;
    }
    local fit: LogisticResult = Logistic.fit(y, x, rows, lags, 50);
    local last: float[10];
    loop (local j: int = 0; j < lags; j = j + 1) {
        last[j] = r[n - 1 - j] * 100.0;
    }
    local w: JsonWriter = JsonWriter.new(512);
    w.precision = 8;
    w.beginObject();
    w.fieldNumArray("coefficients", fit.beta, fit.k);
    w.fieldNum("in_sample_accuracy", fit.accuracy);
    w.fieldNum("log_likelihood", fit.log_likelihood);
    w.fieldBool("converged", fit.converged);
    w.fieldNum("p_up_next", fit.predict(&last[0]));
    w.endObject();
    fit.destroy();
    free(cast<*void>(r));
    free(cast<*void>(x));
    free(cast<*void>(y));
    Reply.ok(res, &w);
    w.destroy();
}

global boot_stats: string[4] = ["mean", "stddev", "sharpe", "median"];

frame bootstrapHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local symbol: string = p.path("symbol");
    local stat_name: string = p.oneOf("statistic", "sharpe", &boot_stats[0], 4);
    local resamples: int = p.integer("resamples", 2000, 100, 100000);
    local level: float = p.num("level", 0.95, 0.5, 0.999);
    if (p.reject(res)) {
        return;
    }
    local s: *AppState = appState();
    local e: *SeriesEntry = s.series.find(symbol);
    if (e == nullptr) {
        Reply.notFound(res, "no series for symbol");
        return;
    }
    local n: int = e.bars.len - 1;
    if (n < 10) {
        Reply.error(res, 422, "not enough bars");
        return;
    }
    local r: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    loop (local i: int = 0; i < n; i = i + 1) {
        r[i] = (e.bars.close[i + 1] / e.bars.close[i]) - 1.0;
    }
    local which: int = 0;
    loop (local i: int = 0; i < 4; i = i + 1) {
        if (Text.equals(stat_name, boot_stats[i])) {
            which = i;
        }
    }
    local lo: float = 0.0;
    local hi: float = 0.0;
    local point: float = Bootstrap.interval(r, n, which, resamples, level, cast<u64>(11), &lo, &hi);
    local bw: float = Kde.silverman(r, n);
    local w: JsonWriter = JsonWriter.new(1024);
    w.precision = 8;
    w.beginObject();
    w.fieldStr("statistic", stat_name);
    w.fieldNum("estimate", point);
    w.fieldNum("ci_low", lo);
    w.fieldNum("ci_high", hi);
    w.fieldNum("level", level);
    w.fieldNum("kde_bandwidth", bw);
    w.key("return_density").beginArray();
    local lo_r: float = -0.06;
    loop (local k: int = 0; k <= 24; k = k + 1) {
        local at: float = lo_r + (0.005 * cast<float>(k));
        w.beginArray().num(at).num(Kde.density(r, n, bw, at)).endArray();
    }
    w.endArray();
    w.endObject();
    free(cast<*void>(r));
    Reply.ok(res, &w);
    w.destroy();
}

# Body: {"maturities":[1,3,5], "spreads":[0.005,0.008,0.011], "recovery":0.4, "rate":0.03, "contract_spread":0.01, "contract_maturity":5}
frame cdsHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    if (!p.parseBody(65536)) {
        p.reject(res);
        return;
    }
    local recovery: float = p.num("recovery", 0.4, 0.0, 0.99);
    local rate: float = p.num("rate", 0.03, -0.1, 0.5);
    local contract: float = p.num("contract_spread", 0.01, 0.0, 1.0);
    local contract_mat: float = p.num("contract_maturity", 5.0, 0.25, 30.0);
    local notional: float = p.num("notional", 10000000.0, 1.0, 1000000000000.0);
    if (p.reject(res)) {
        return;
    }
    local mats: float[32];
    local spreads: float[32];
    local nm: int = p.body.numbers(p.body.get(p.body.root(), "maturities"), &mats[0], 32);
    local ns: int = p.body.numbers(p.body.get(p.body.root(), "spreads"), &spreads[0], 32);
    if ((nm < 1) || (nm != ns)) {
        Reply.error(res, 422, "maturities and spreads must be equal-length numeric arrays (1-32)");
        return;
    }
    loop (local i: int = 0; i < nm; i = i + 1) {
        if (!(mats[i] > 0.0) || ((i > 0) && (mats[i] <= mats[i - 1])) || !(spreads[i] > 0.0) || (spreads[i] > 1.0)) {
            Reply.error(res, 422, "maturities must increase and spreads must be in (0, 1]");
            return;
        }
    }
    local curve: DiscountCurve = DiscountCurve.flat(rate);
    local h: HazardCurve = Cds.bootstrap(&curve, &mats[0], &spreads[0], nm, recovery);
    local v: CdsValue = Cds.value(&h, &curve, contract_mat, contract, notional);
    local w: JsonWriter = JsonWriter.new(1024);
    w.precision = 10;
    w.beginObject();
    w.key("hazards").beginArray();
    loop (local i: int = 0; i < nm; i = i + 1) {
        w.beginObject();
        w.fieldNum("to", h.times[i]);
        w.fieldNum("hazard", h.hazards[i]);
        w.fieldNum("survival", h.survival(h.times[i]));
        w.endObject();
    }
    w.endArray();
    w.key("contract").beginObject();
    w.fieldNum("par_spread", v.par_spread);
    w.fieldNum("risky_annuity", v.risky_annuity);
    w.fieldNum("premium_leg", v.premium_leg);
    w.fieldNum("protection_leg", v.protection_leg);
    w.fieldNum("mtm_protection_buyer", v.mtm);
    w.endObject();
    w.endObject();
    h.destroy();
    curve.destroy();
    Reply.ok(res, &w);
    w.destroy();
}

frame mertonHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local equity: float = p.requiredNum("equity", 0.0001, 1000000000000.0);
    local equity_vol: float = p.requiredNum("equity_vol", 0.001, 5.0);
    local debt: float = p.requiredNum("debt", 0.0001, 1000000000000.0);
    local rate: float = p.num("rate", 0.03, -0.1, 0.5);
    local horizon: float = p.num("horizon", 1.0, 0.01, 30.0);
    if (p.reject(res)) {
        return;
    }
    local m: MertonResult = Merton.solve(equity, equity_vol, debt, rate, horizon);
    local w: JsonWriter = JsonWriter.new(512);
    w.precision = 10;
    w.beginObject();
    w.fieldBool("converged", m.converged);
    w.fieldNum("asset_value", m.asset_value);
    w.fieldNum("asset_vol", m.asset_vol);
    w.fieldNum("distance_to_default", m.distance_to_default);
    w.fieldNum("default_probability", m.default_probability);
    w.fieldNum("credit_spread", m.credit_spread);
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

frame portfolioLossHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local pd: float = p.requiredNum("pd", 0.000001, 0.999);
    local rho: float = p.num("rho", 0.15, 0.000001, 0.999);
    local lgd: float = p.num("lgd", 0.45, 0.0, 1.0);
    local exposure: float = p.num("exposure", 1000000.0, 0.0, 1000000000000000.0);
    if (p.reject(res)) {
        return;
    }
    local w: JsonWriter = JsonWriter.new(512);
    w.precision = 10;
    w.beginObject();
    w.fieldNum("expected_loss", Vasicek1F.expectedLoss(pd, lgd) * exposure);
    w.key("quantiles").beginObject();
    w.fieldNum("q95", Vasicek1F.lossQuantile(pd, rho, lgd, 0.95) * exposure);
    w.fieldNum("q99", Vasicek1F.lossQuantile(pd, rho, lgd, 0.99) * exposure);
    w.fieldNum("q999", Vasicek1F.lossQuantile(pd, rho, lgd, 0.999) * exposure);
    w.endObject();
    w.fieldNum("unexpected_loss_999", (Vasicek1F.lossQuantile(pd, rho, lgd, 0.999) - Vasicek1F.expectedLoss(pd, lgd)) * exposure);
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

frame fxHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local spot: float = p.requiredNum("spot", 0.000001, 1000000.0);
    local rd: float = p.num("rd", 0.05, -0.2, 1.0);
    local rf: float = p.num("rf", 0.03, -0.2, 1.0);
    local t: float = p.num("expiry", 1.0, 0.001, 30.0);
    local vol: float = p.num("vol", 0.1, 0.0001, 5.0);
    local strike: float = p.num("strike", spot, 0.000001, 1000000.0);
    local pip: float = p.num("pip", 0.0001, 0.0000001, 1.0);
    if (p.reject(res)) {
        return;
    }
    local fwd: float = Fx.forward(spot, rd, rf, t);
    local w: JsonWriter = JsonWriter.new(512);
    w.precision = 10;
    w.beginObject();
    w.fieldNum("forward", fwd);
    w.fieldNum("forward_points", Fx.forwardPoints(spot, rd, rf, t, pip));
    w.fieldNum("call", Fx.option(true, spot, strike, rd, rf, vol, t));
    w.fieldNum("put", Fx.option(false, spot, strike, rd, rf, vol, t));
    w.fieldNum("atm_forward_call", Fx.option(true, spot, fwd, rd, rf, vol, t));
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}
