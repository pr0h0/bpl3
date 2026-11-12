# Risk and analytics endpoints. Portfolio inputs come either from listed
# symbols (returns computed from their bar history) or from an explicit JSON
# body with `mu` and `cov`.

import [Request], [Response] from "bpl-express";
import [Math] from "std/math.bpl";
import malloc, free from "std/c.bpl";
import [JsonWriter] from "../core/json_writer.bpl";
import [JsonDoc], [JsonKind] from "../core/json_doc.bpl";
import [Text] from "../core/text.bpl";
import [Clock] from "../core/clock.bpl";
import [AppState], appState from "./state.bpl";
import [Reply] from "./respond.bpl";
import [Params] from "./params.bpl";
import [Matrix], [EigenResult] from "../math/matrix.bpl";
import [Stats], [Moments], [Regression], [TTest] from "../math/stats.bpl";
import [ReturnPanel], [Covariance] from "../risk/covariance.bpl";
import [VaR], [VarReport], [BacktestResult] from "../risk/var.bpl";
import [Portfolio], [Allocation], [Frontier] from "../risk/portfolio.bpl";
import [SeriesEntry] from "../series/store.bpl";

export varHandler;
export optimizeHandler;
export covarianceHandler;
export frontierHandler;
export backtestVarHandler;
export describeHandler;
export regressionHandler;
export matrixHandler;
export correlationHandler;

global const MAX_ASSETS: int = 32;
global const MAX_SERIES: int = 100000;

# Portfolio universe: symbols, their aligned return panel, and weights.
struct Universe {
    count: int,
    names: string[32],
    weights: float[32],
    panel: ReturnPanel,
    has_panel: bool,
    mu: float[32],
    cov: Matrix,
    has_cov: bool,
    error: string,

    frame destroy(this: *Universe) {
        if (this.has_panel) {
            this.panel.destroy();
        }
        if (this.has_cov) {
            this.cov.destroy();
        }
    }
}

# Reads `symbols` (comma separated or JSON array of strings) and optional weights.
frame loadUniverse(p: *Params, lookback: int) ret Universe {
    local u: Universe;
    u.count = 0;
    u.has_panel = false;
    u.has_cov = false;
    u.error = nullptr;
    local s: *AppState = appState();
    local listed: string = p.raw("symbols");
    if (listed != nullptr) {
        local n: int = Text.length(listed);
        local start: int = 0;
        loop (local i: int = 0; i <= n; i = i + 1) {
            if ((i == n) || (listed[i] == ',')) {
                if ((i > start) && (u.count < MAX_ASSETS)) {
                    local name: string = Text.copyN(cast<string>(cast<*char>(listed) + start), i - start);
                    local e: *SeriesEntry = s.series.find(name);
                    if (e == nullptr) {
                        u.error = "unknown symbol in universe";
                    } else {
                        u.names[u.count] = s.series.symbolAt(s.series.names.find(name));
                        u.count = u.count + 1;
                    }
                    Text.release(name);
                }
                start = i + 1;
            }
        }
    } else if (p.has_body) {
        local arr: int = p.body.get(p.body.root(), "symbols");
        if (p.body.isKind(arr, JsonKind.Array)) {
            local cur: int = p.body.first(arr);
            loop ((cur >= 0) && (u.count < MAX_ASSETS)) {
                local name: string = p.body.str(cur);
                local e: *SeriesEntry = name == nullptr ? nullptr : s.series.find(name);
                if (e == nullptr) {
                    u.error = "unknown symbol in universe";
                } else {
                    u.names[u.count] = s.series.symbolAt(s.series.names.find(name));
                    u.count = u.count + 1;
                }
                cur = p.body.next(cur);
            }
        }
    }
    if (u.error != nullptr) {
        return u;
    }
    if (u.count < 1) {
        u.error = "symbols must name at least one series";
        return u;
    }
    # Align on the shortest history, using the last `lookback` returns.
    local periods: int = lookback;
    loop (local i: int = 0; i < u.count; i = i + 1) {
        local e: *SeriesEntry = s.series.find(u.names[i]);
        if ((e.bars.len - 1) < periods) {
            periods = e.bars.len - 1;
        }
    }
    if (periods < (u.count + 2)) {
        u.error = "not enough history for this many assets";
        return u;
    }
    u.panel = ReturnPanel.new(u.count, periods);
    u.has_panel = true;
    loop (local i: int = 0; i < u.count; i = i + 1) {
        local e: *SeriesEntry = s.series.find(u.names[i]);
        local base: int = e.bars.len - periods - 1;
        loop (local t: int = 0; t < periods; t = t + 1) {
            local a: float = e.bars.close[base + t];
            local b: float = e.bars.close[base + t + 1];
            u.panel.put(i, t, Math.log(b / a));
        }
        u.mu[i] = u.panel.mean(i);
    }
    u.cov = Covariance.sample(&u.panel);
    u.has_cov = true;
    # Weights: explicit array, else equal.
    local given: int = -1;
    if (p.has_body) {
        given = p.body.numbers(p.body.get(p.body.root(), "weights"), &u.weights[0], MAX_ASSETS);
    }
    if (given != u.count) {
        if (given > 0) {
            u.error = "weights must have one entry per symbol";
            return u;
        }
        loop (local i: int = 0; i < u.count; i = i + 1) {
            u.weights[i] = 1.0 / cast<float>(u.count);
        }
    }
    return u;
}

frame bodyIfAny(req: *Request, res: *Response, p: *Params) ret bool {
    if ((req.body_length > 0) && !p.parseBody(262144)) {
        p.reject(res);
        return false;
    }
    return true;
}

frame writeVar(w: *JsonWriter, name: string, r: *VarReport) {
    w.key(name).beginObject();
    w.fieldStr("method", r.method);
    w.fieldNum("var", r.var);
    w.fieldNum("es", r.es);
    w.fieldNum("confidence", r.confidence);
    w.fieldNum("horizon_days", r.horizon_days);
    w.endObject();
}

frame varHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    if (!bodyIfAny(req, res, &p)) {
        return;
    }
    local confidence: float = p.num("confidence", 0.99, 0.5, 0.9999);
    local horizon: float = p.num("horizon_days", 1.0, 1.0, 250.0);
    local value: float = p.num("value", 1000000.0, 0.0, 1000000000000.0);
    local lookback: int = p.integer("lookback", 250, 10, 5000);
    local paths: int = p.integer("paths", 20000, 1000, 500000);
    if (p.reject(res)) {
        return;
    }
    local u: Universe = loadUniverse(&p, lookback);
    local uo: *Universe = &u;
    defer uo.destroy();
    if (u.error != nullptr) {
        Reply.error(res, 422, u.error);
        return;
    }
    local started: long = Clock.nowNs();
    local series: *float = cast<*float>(malloc(cast<long>(u.panel.periods) * sizeof(float)));
    u.panel.portfolioReturns(&u.weights[0], series);
    local hist: VarReport = VaR.historical(series, u.panel.periods, confidence, value);
    local para: VarReport = VaR.portfolio(&u.weights[0], &u.mu[0], &u.cov, confidence, horizon, value);
    local cf: VarReport = VaR.cornishFisher(series, u.panel.periods, confidence, value);
    local fhs: VarReport = VaR.filteredHistorical(series, u.panel.periods, 0.94, confidence, value);
    local mc: VarReport = VaR.monteCarlo(&u.weights[0], &u.mu[0], &u.cov, confidence, value, paths, cast<u64>(7));
    local comps: float[32];
    local total: float = VaR.components(&u.weights[0], &u.cov, confidence, value, &comps[0]);
    local w: JsonWriter = JsonWriter.new(2048);
    w.precision = 8;
    w.beginObject();
    w.fieldInt("assets", cast<long>(u.count));
    w.fieldInt("observations", cast<long>(u.panel.periods));
    writeVar(&w, "historical", &hist);
    writeVar(&w, "parametric", &para);
    writeVar(&w, "cornish_fisher", &cf);
    writeVar(&w, "filtered_historical", &fhs);
    writeVar(&w, "monte_carlo", &mc);
    w.key("components").beginArray();
    loop (local i: int = 0; i < u.count; i = i + 1) {
        w.beginObject();
        w.fieldStr("symbol", u.names[i]);
        w.fieldNum("weight", u.weights[i]);
        w.fieldNum("component_var", comps[i]);
        w.fieldNum("share", total != 0.0 ? comps[i] / total : 0.0);
        w.endObject();
    }
    w.endArray();
    local worst_index: int = 0;
    w.fieldNum("worst_day_return", VaR.worstScenario(&u.panel, &u.weights[0], &worst_index));
    w.fieldInt("worst_day_index", cast<long>(worst_index));
    w.fieldFixed("elapsed_ms", Clock.elapsedMs(started), 3);
    w.endObject();
    free(cast<*void>(series));
    Reply.ok(res, &w);
    w.destroy();
}

frame writeAllocation(w: *JsonWriter, name: string, a: *Allocation, u: *Universe) {
    w.key(name).beginObject();
    w.fieldBool("ok", a.ok);
    w.fieldNum("expected_return", a.expected_return * 252.0);
    w.fieldNum("volatility", a.volatility * Math.sqrt(252.0));
    w.fieldNum("sharpe", a.sharpe * Math.sqrt(252.0));
    w.key("weights").beginObject();
    loop (local i: int = 0; i < a.n; i = i + 1) {
        w.fieldNum(u.names[i], a.weights[i]);
    }
    w.endObject();
    if (a.iterations > 0) {
        w.fieldInt("iterations", cast<long>(a.iterations));
    }
    w.endObject();
}

global optimizer_names: string[7] = ["all", "min_variance", "max_sharpe", "long_only", "risk_parity", "inverse_vol", "equal_weight"];

frame optimizeHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    if (!bodyIfAny(req, res, &p)) {
        return;
    }
    local method: string = p.oneOf("method", "all", &optimizer_names[0], 7);
    local lookback: int = p.integer("lookback", 250, 10, 5000);
    local risk_free: float = p.num("risk_free", 0.0, -0.5, 0.5) / 252.0;
    local aversion: float = p.num("risk_aversion", 3.0, 0.01, 1000.0);
    local shrink: bool = p.flag("shrink", false);
    if (p.reject(res)) {
        return;
    }
    local u: Universe = loadUniverse(&p, lookback);
    local uo: *Universe = &u;
    defer uo.destroy();
    if (u.error != nullptr) {
        Reply.error(res, 422, u.error);
        return;
    }
    local delta: float = 0.0;
    if (shrink) {
        u.cov.destroy();
        u.cov = Covariance.ledoitWolf(&u.panel, &delta);
    }
    local started: long = Clock.nowNs();
    local all: bool = Text.equals(method, "all");
    local w: JsonWriter = JsonWriter.new(4096);
    w.precision = 8;
    w.beginObject();
    w.fieldInt("assets", cast<long>(u.count));
    w.fieldInt("observations", cast<long>(u.panel.periods));
    if (shrink) {
        w.fieldNum("shrinkage", delta);
    }
    if (all || Text.equals(method, "min_variance")) {
        local a: Allocation = Portfolio.minVariance(&u.mu[0], &u.cov, risk_free);
        writeAllocation(&w, "min_variance", &a, &u);
        a.destroy();
    }
    if (all || Text.equals(method, "max_sharpe")) {
        local a: Allocation = Portfolio.maxSharpe(&u.mu[0], &u.cov, risk_free);
        writeAllocation(&w, "max_sharpe", &a, &u);
        a.destroy();
    }
    if (all || Text.equals(method, "long_only")) {
        local a: Allocation = Portfolio.longOnly(&u.mu[0], &u.cov, aversion, risk_free, 20000);
        writeAllocation(&w, "long_only", &a, &u);
        a.destroy();
    }
    if (all || Text.equals(method, "risk_parity")) {
        local a: Allocation = Portfolio.riskParity(&u.mu[0], &u.cov, risk_free, 1000);
        writeAllocation(&w, "risk_parity", &a, &u);
        a.destroy();
    }
    if (all || Text.equals(method, "inverse_vol")) {
        local a: Allocation = Portfolio.inverseVol(&u.mu[0], &u.cov, risk_free);
        writeAllocation(&w, "inverse_vol", &a, &u);
        a.destroy();
    }
    if (all || Text.equals(method, "equal_weight")) {
        local a: Allocation = Portfolio.equalWeight(&u.mu[0], &u.cov, risk_free);
        writeAllocation(&w, "equal_weight", &a, &u);
        a.destroy();
    }
    w.fieldFixed("elapsed_ms", Clock.elapsedMs(started), 3);
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

frame writeMatrix(w: *JsonWriter, name: string, m: *Matrix) {
    w.key(name).beginArray();
    loop (local i: int = 0; i < m.rows; i = i + 1) {
        w.numArray(m.row(i), m.cols);
    }
    w.endArray();
}

global cov_methods: string[3] = ["sample", "ewma", "ledoit_wolf"];

frame covarianceHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    if (!bodyIfAny(req, res, &p)) {
        return;
    }
    local method: string = p.oneOf("method", "sample", &cov_methods[0], 3);
    local lookback: int = p.integer("lookback", 250, 10, 5000);
    local lambda: float = p.num("lambda", 0.94, 0.5, 0.9999);
    if (p.reject(res)) {
        return;
    }
    local u: Universe = loadUniverse(&p, lookback);
    local uo: *Universe = &u;
    defer uo.destroy();
    if (u.error != nullptr) {
        Reply.error(res, 422, u.error);
        return;
    }
    local delta: float = 0.0;
    local cov: Matrix;
    if (Text.equals(method, "ewma")) {
        cov = Covariance.ewma(&u.panel, lambda);
    } else if (Text.equals(method, "ledoit_wolf")) {
        cov = Covariance.ledoitWolf(&u.panel, &delta);
    } else {
        cov = u.cov.copy();
    }
    cov.scaleInPlace(252.0);
    local corr: Matrix = Covariance.toCorrelation(&cov);
    local e: EigenResult = cov.eigenSymmetric();
    local w: JsonWriter = JsonWriter.new(4096);
    w.precision = 8;
    w.beginObject();
    w.fieldStr("method", method);
    w.key("symbols").beginArray();
    loop (local i: int = 0; i < u.count; i = i + 1) {
        w.str(u.names[i]);
    }
    w.endArray();
    writeMatrix(&w, "covariance", &cov);
    writeMatrix(&w, "correlation", &corr);
    w.fieldNumArray("eigenvalues", e.values, e.n);
    local total: float = 0.0;
    loop (local i: int = 0; i < e.n; i = i + 1) {
        total = total + e.values[i];
    }
    w.fieldNum("first_factor_share", total > 0.0 ? e.values[0] / total : 0.0);
    w.fieldNum("average_correlation", Covariance.averageCorrelation(&corr));
    if (Text.equals(method, "ledoit_wolf")) {
        w.fieldNum("shrinkage", delta);
    }
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
    cov.destroy();
    corr.destroy();
    e.destroy();
}

frame frontierHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    if (!bodyIfAny(req, res, &p)) {
        return;
    }
    local points: int = p.integer("points", 20, 2, 200);
    local lookback: int = p.integer("lookback", 250, 10, 5000);
    if (p.reject(res)) {
        return;
    }
    local u: Universe = loadUniverse(&p, lookback);
    local uo: *Universe = &u;
    defer uo.destroy();
    if (u.error != nullptr) {
        Reply.error(res, 422, u.error);
        return;
    }
    if (u.count < 2) {
        Reply.error(res, 422, "frontier needs at least two symbols");
        return;
    }
    local f: Frontier = Portfolio.frontier(&u.mu[0], &u.cov, points);
    local w: JsonWriter = JsonWriter.new(256 + (points * 64));
    w.precision = 8;
    w.beginObject();
    w.key("points").beginArray();
    loop (local i: int = 0; i < points; i = i + 1) {
        w.beginObject();
        w.fieldNum("return", f.returns[i] * 252.0);
        w.fieldNum("volatility", f.vols[i] * Math.sqrt(252.0));
        w.endObject();
    }
    w.endArray();
    w.endObject();
    f.destroy();
    Reply.ok(res, &w);
    w.destroy();
}

frame backtestVarHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    if (!bodyIfAny(req, res, &p)) {
        return;
    }
    local confidence: float = p.num("confidence", 0.99, 0.5, 0.9999);
    local window: int = p.integer("window", 100, 20, 2000);
    if (p.reject(res)) {
        return;
    }
    local u: Universe = loadUniverse(&p, MAX_SERIES);
    local uo: *Universe = &u;
    defer uo.destroy();
    if (u.error != nullptr) {
        Reply.error(res, 422, u.error);
        return;
    }
    local n: int = u.panel.periods;
    if (n <= (window + 10)) {
        Reply.error(res, 422, "history too short for the backtest window");
        return;
    }
    local series: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    local forecasts: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    u.panel.portfolioReturns(&u.weights[0], series);
    VaR.rollingHistorical(series, n, window, confidence, forecasts);
    local bt: BacktestResult = VaR.backtest(series + window, forecasts + window, n - window, confidence);
    local w: JsonWriter = JsonWriter.new(512);
    w.precision = 8;
    w.beginObject();
    w.fieldInt("observations", cast<long>(bt.observations));
    w.fieldInt("exceptions", cast<long>(bt.exceptions));
    w.fieldNum("expected", bt.expected);
    w.fieldNum("kupiec_lr", bt.kupiec_lr);
    w.fieldNum("kupiec_p", bt.kupiec_p);
    w.fieldNum("christoffersen_lr", bt.christoffersen_lr);
    w.fieldStr("zone", bt.zone);
    w.endObject();
    free(cast<*void>(series));
    free(cast<*void>(forecasts));
    Reply.ok(res, &w);
    w.destroy();
}

# Reads a numeric array field from the body into a fresh buffer.
frame bodyArray(p: *Params, name: string, count: *int) ret *float {
    local node: int = p.body.get(p.body.root(), name);
    local n: int = p.body.length(node);
    if (!p.body.isKind(node, JsonKind.Array) || (n < 1) || (n > MAX_SERIES)) {
        p.fail(name, "must be a non-empty numeric array");
        *count = 0;
        return nullptr;
    }
    local out: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    local got: int = p.body.numbers(node, out, n);
    if (got != n) {
        p.fail(name, "must contain only numbers");
        free(cast<*void>(out));
        *count = 0;
        return nullptr;
    }
    *count = n;
    return out;
}

frame describeHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    if (!p.parseBody(4194304)) {
        p.reject(res);
        return;
    }
    local n: int = 0;
    local x: *float = bodyArray(&p, "values", &n);
    if (p.reject(res)) {
        return;
    }
    local m: Moments = Stats.moments(x, n);
    local w: JsonWriter = JsonWriter.new(1024);
    w.precision = 10;
    w.beginObject();
    w.fieldInt("count", cast<long>(n));
    w.fieldNum("mean", m.mean);
    w.fieldNum("stddev", m.stddev);
    w.fieldNum("variance", m.variance);
    w.fieldNum("skewness", m.skewness);
    w.fieldNum("kurtosis", m.kurtosis);
    w.fieldNum("min", m.min);
    w.fieldNum("max", m.max);
    w.fieldNum("median", Stats.median(x, n));
    w.fieldNum("mad", Stats.mad(x, n));
    w.key("quantiles").beginObject();
    w.fieldNum("p01", Stats.quantile(x, n, 0.01));
    w.fieldNum("p05", Stats.quantile(x, n, 0.05));
    w.fieldNum("p25", Stats.quantile(x, n, 0.25));
    w.fieldNum("p75", Stats.quantile(x, n, 0.75));
    w.fieldNum("p95", Stats.quantile(x, n, 0.95));
    w.fieldNum("p99", Stats.quantile(x, n, 0.99));
    w.endObject();
    if (n > 7) {
        local jb: TTest = Stats.jarqueBera(x, n);
        w.fieldNum("jarque_bera", jb.t);
        w.fieldNum("jarque_bera_p", jb.p_value);
        w.fieldNum("acf1", Stats.autocorrelation(x, n, 1));
    }
    w.endObject();
    free(cast<*void>(x));
    Reply.ok(res, &w);
    w.destroy();
}

frame regressionHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    if (!p.parseBody(4194304)) {
        p.reject(res);
        return;
    }
    local nx: int = 0;
    local ny: int = 0;
    local x: *float = bodyArray(&p, "x", &nx);
    local y: *float = bodyArray(&p, "y", &ny);
    if (p.ok() && (nx != ny)) {
        p.fail("y", "must have the same length as x");
    }
    if (p.ok() && (nx < 3)) {
        p.fail("x", "needs at least 3 points");
    }
    if (p.reject(res)) {
        if (x != nullptr) {
            free(cast<*void>(x));
        }
        if (y != nullptr) {
            free(cast<*void>(y));
        }
        return;
    }
    local r: Regression = Stats.linearRegression(x, y, nx);
    local w: JsonWriter = JsonWriter.new(512);
    w.precision = 10;
    w.beginObject();
    w.fieldNum("slope", r.slope);
    w.fieldNum("intercept", r.intercept);
    w.fieldNum("r2", r.r2);
    w.fieldNum("stderr_slope", r.stderr_slope);
    w.fieldNum("stderr_intercept", r.stderr_intercept);
    w.fieldNum("residual_stddev", r.residual_stddev);
    w.fieldNum("pearson", Stats.correlation(x, y, nx));
    w.fieldNum("spearman", Stats.spearman(x, y, nx));
    w.endObject();
    free(cast<*void>(x));
    free(cast<*void>(y));
    Reply.ok(res, &w);
    w.destroy();
}

frame correlationHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    if (!bodyIfAny(req, res, &p)) {
        return;
    }
    local lookback: int = p.integer("lookback", 250, 10, 5000);
    if (p.reject(res)) {
        return;
    }
    local u: Universe = loadUniverse(&p, lookback);
    local uo: *Universe = &u;
    defer uo.destroy();
    if (u.error != nullptr) {
        Reply.error(res, 422, u.error);
        return;
    }
    local w: JsonWriter = JsonWriter.new(2048);
    w.precision = 8;
    w.beginObject();
    w.key("pairs").beginArray();
    loop (local i: int = 0; i < u.count; i = i + 1) {
        loop (local j: int = i + 1; j < u.count; j = j + 1) {
            local xi: *float = u.panel.column(i);
            local xj: *float = u.panel.column(j);
            local reg: Regression = Stats.linearRegression(xi, xj, u.panel.periods);
            w.beginObject();
            w.fieldStr("a", u.names[i]);
            w.fieldStr("b", u.names[j]);
            w.fieldNum("pearson", Stats.correlation(xi, xj, u.panel.periods));
            w.fieldNum("spearman", Stats.spearman(xi, xj, u.panel.periods));
            w.fieldNum("beta", reg.slope);
            w.endObject();
        }
    }
    w.endArray();
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

global matrix_ops: string[6] = ["inverse", "cholesky", "eigen", "determinant", "solve", "multiply"];

frame readMatrix(p: *Params, name: string, out: *Matrix) ret bool {
    local node: int = p.body.get(p.body.root(), name);
    local rows: int = p.body.length(node);
    if (!p.body.isKind(node, JsonKind.Array) || (rows < 1) || (rows > 200)) {
        p.fail(name, "must be an array of 1-200 numeric rows");
        return false;
    }
    local first: int = p.body.first(node);
    local cols: int = p.body.length(first);
    if (!p.body.isKind(first, JsonKind.Array) || (cols < 1) || (cols > 200)) {
        p.fail(name, "rows must be numeric arrays of 1-200 entries");
        return false;
    }
    *out = Matrix.new(rows, cols);
    local r: int = 0;
    local cur: int = first;
    loop (cur >= 0) {
        if (p.body.numbers(cur, out.row(r), cols) != cols) {
            p.fail(name, "rows must all have the same length and contain only numbers");
            out.destroy();
            return false;
        }
        r = r + 1;
        cur = p.body.next(cur);
    }
    return true;
}

frame matrixHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    if (!p.parseBody(4194304)) {
        p.reject(res);
        return;
    }
    local op: string = p.oneOf("op", "inverse", &matrix_ops[0], 6);
    local a: Matrix;
    local have: bool = readMatrix(&p, "a", &a);
    if (p.reject(res)) {
        return;
    }
    local ao: *Matrix = &a;
    defer ao.destroy();
    local needs_square: bool = !Text.equals(op, "multiply");
    if (have && needs_square && !a.isSquare()) {
        Reply.error(res, 422, "matrix must be square for this operation");
        return;
    }
    local w: JsonWriter = JsonWriter.new(1024 + (a.rows * a.cols * 24));
    w.precision = 12;
    w.beginObject();
    w.fieldStr("op", op);
    if (Text.equals(op, "inverse")) {
        local inv: Matrix;
        local ok: bool = a.inverse(&inv);
        w.fieldBool("ok", ok);
        if (ok) {
            writeMatrix(&w, "result", &inv);
            inv.destroy();
        }
    } else if (Text.equals(op, "cholesky")) {
        if (a.isSymmetric(0.000000001)) {
            local l: Matrix;
            local ok: bool = a.cholesky(&l);
            w.fieldBool("ok", ok);
            if (ok) {
                writeMatrix(&w, "result", &l);
            }
            l.destroy();
        } else {
            w.fieldBool("ok", false);
            w.fieldStr("error", "matrix is not symmetric");
        }
    } else if (Text.equals(op, "eigen")) {
        if (!a.isSymmetric(0.000000001)) {
            w.destroy();
            Reply.error(res, 422, "eigen requires a symmetric matrix");
            return;
        }
        local e: EigenResult = a.eigenSymmetric();
        w.fieldNumArray("values", e.values, e.n);
        writeMatrix(&w, "vectors", &e.vectors);
        w.fieldInt("sweeps", cast<long>(e.sweeps));
        e.destroy();
    } else if (Text.equals(op, "determinant")) {
        w.fieldNum("result", a.determinant());
    } else if (Text.equals(op, "solve")) {
        local n: int = 0;
        local b: *float = bodyArray(&p, "b", &n);
        if ((b == nullptr) || (n != a.rows)) {
            if (b != nullptr) {
                free(cast<*void>(b));
            }
            w.destroy();
            Reply.error(res, 422, "b must be a numeric array with one entry per row");
            return;
        }
        local x: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        local ok: bool = a.solve(b, x);
        w.fieldBool("ok", ok);
        if (ok) {
            w.fieldNumArray("x", x, n);
        }
        free(cast<*void>(b));
        free(cast<*void>(x));
    } else {
        local bm: Matrix;
        if (!readMatrix(&p, "b", &bm)) {
            w.destroy();
            p.reject(res);
            return;
        }
        if (a.cols != bm.rows) {
            bm.destroy();
            w.destroy();
            Reply.error(res, 422, "a.cols must equal b.rows");
            return;
        }
        local prod: Matrix = a.mul(&bm);
        writeMatrix(&w, "result", &prod);
        prod.destroy();
        bm.destroy();
    }
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}
