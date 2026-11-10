# Optimization endpoints: generic LP and box-constrained portfolios.

import [Request], [Response] from "bpl-express";
import malloc, free from "std/c.bpl";
import [Math] from "std/math.bpl";
import [JsonWriter] from "../core/json_writer.bpl";
import [JsonKind] from "../core/json_doc.bpl";
import [Text] from "../core/text.bpl";
import [Clock] from "../core/clock.bpl";
import [AppState], appState from "./state.bpl";
import [Reply] from "./respond.bpl";
import [Params] from "./params.bpl";
import [Matrix] from "../math/matrix.bpl";
import [Simplex], [LpResult], [LpStatus], [Constraint], [BoxQp], [QpResult] from "../math/linprog.bpl";
import [ReturnPanel], [Covariance] from "../risk/covariance.bpl";
import [SeriesEntry] from "../series/store.bpl";

export lpHandler;
export constrainedPortfolioHandler;

global const MAX_LP: int = 200;

# Body: {"objective": [..n], "constraints": [{"a": [..n], "op": "<=|=|>=", "b": x}], "sense": "max|min"}
frame lpHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    if (!p.parseBody(1048576)) {
        p.reject(res);
        return;
    }
    local root: int = p.body.root();
    local c: *float = cast<*float>(malloc(cast<long>(MAX_LP) * sizeof(float)));
    local n: int = p.body.numbers(p.body.get(root, "objective"), c, MAX_LP);
    if (n < 1) {
        free(cast<*void>(c));
        Reply.error(res, 422, "objective must be a numeric array of 1-200 entries");
        return;
    }
    local minimize: bool = Text.equals(p.body.getStr(root, "sense"), "min");
    if (minimize) {
        loop (local j: int = 0; j < n; j = j + 1) {
            c[j] = -c[j];
        }
    }
    local rows_node: int = p.body.get(root, "constraints");
    local m: int = p.body.length(rows_node);
    if (!p.body.isKind(rows_node, JsonKind.Array) || (m < 1) || (m > MAX_LP)) {
        free(cast<*void>(c));
        Reply.error(res, 422, "constraints must be an array of 1-200 rows");
        return;
    }
    local a: *float = cast<*float>(malloc(cast<long>(m * n) * sizeof(float)));
    local b: *float = cast<*float>(malloc(cast<long>(m) * sizeof(float)));
    local kinds: *Constraint = cast<*Constraint>(malloc(cast<long>(m) * sizeof(Constraint)));
    local cur: int = p.body.first(rows_node);
    local i: int = 0;
    local error: string = nullptr;
    loop ((cur >= 0) && (error == nullptr)) {
        if (p.body.numbers(p.body.get(cur, "a"), a + (i * n), n) != n) {
            error = "each constraint needs an `a` array with one entry per variable";
        }
        local op: string = p.body.getStr(cur, "op");
        if (Text.equals(op, "<=")) {
            kinds[i] = Constraint.LessEq;
        } else if (Text.equals(op, ">=")) {
            kinds[i] = Constraint.GreaterEq;
        } else if (Text.equals(op, "=")) {
            kinds[i] = Constraint.Equal;
        } else {
            error = "constraint op must be <=, = or >=";
        }
        local bn: int = p.body.get(cur, "b");
        if (!p.body.isKind(bn, JsonKind.Number)) {
            error = "each constraint needs a numeric `b`";
        }
        b[i] = p.body.num(bn, 0.0);
        i = i + 1;
        cur = p.body.next(cur);
    }
    if (error != nullptr) {
        free(cast<*void>(c));
        free(cast<*void>(a));
        free(cast<*void>(b));
        free(cast<*void>(kinds));
        Reply.error(res, 422, error);
        return;
    }
    local started: long = Clock.nowNs();
    local r: LpResult = Simplex.maximize(c, a, b, kinds, m, n, 100000);
    local w: JsonWriter = JsonWriter.new(512 + (n * 24));
    w.precision = 12;
    w.beginObject();
    w.fieldStr("status", LpResult.statusName(r.status));
    if (r.status == LpStatus.Optimal) {
        w.fieldNum("objective", minimize ? -r.objective : r.objective);
        w.fieldNumArray("x", r.x, n);
    }
    w.fieldInt("pivots", cast<long>(r.iterations));
    w.fieldFixed("elapsed_ms", Clock.elapsedMs(started), 3);
    w.endObject();
    r.destroy();
    free(cast<*void>(c));
    free(cast<*void>(a));
    free(cast<*void>(b));
    free(cast<*void>(kinds));
    Reply.json(res, r.status == LpStatus.Optimal ? 200 : 422, &w);
    w.destroy();
}

# Mean-variance with per-asset bounds: min 0.5 l w'Sw - mu'w, sum w = 1, lo <= w <= hi.
frame constrainedPortfolioHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local symbols: string = p.str("symbols", nullptr);
    local max_weight: float = p.num("max_weight", 0.4, 0.01, 1.0);
    local min_weight: float = p.num("min_weight", 0.0, -1.0, 1.0);
    local aversion: float = p.num("risk_aversion", 5.0, 0.0, 10000.0);
    local lookback: int = p.integer("lookback", 250, 10, 5000);
    if (symbols == nullptr) {
        p.fail("symbols", "is required");
    }
    if (p.reject(res)) {
        return;
    }
    local s: *AppState = appState();
    local entries: **SeriesEntry = cast<**SeriesEntry>(malloc(32 * sizeof(*SeriesEntry)));
    local owned: **SeriesEntry = entries;
    defer free(cast<*void>(owned));
    local count: int = 0;
    local len: int = Text.length(symbols);
    local start: int = 0;
    loop (local i: int = 0; i <= len; i = i + 1) {
        if ((i == len) || (symbols[i] == ',')) {
            if ((i > start) && (count < 32)) {
                local name: string = Text.copyN(cast<string>(cast<*char>(symbols) + start), i - start);
                local e: *SeriesEntry = s.series.find(name);
                Text.release(name);
                if (e == nullptr) {
                    Reply.error(res, 422, "unknown symbol in universe");
                    return;
                }
                entries[count] = e;
                count = count + 1;
            }
            start = i + 1;
        }
    }
    if (count < 2) {
        Reply.error(res, 422, "need at least two symbols");
        return;
    }
    if (((cast<float>(count) * max_weight) < 1.0) || ((cast<float>(count) * min_weight) > 1.0)) {
        Reply.error(res, 422, "bounds make the budget infeasible");
        return;
    }
    local periods: int = lookback;
    loop (local i: int = 0; i < count; i = i + 1) {
        if ((entries[i].bars.len - 1) < periods) {
            periods = entries[i].bars.len - 1;
        }
    }
    local panel: ReturnPanel = ReturnPanel.new(count, periods);
    local mu: *float = cast<*float>(malloc(cast<long>(count) * sizeof(float)));
    loop (local i: int = 0; i < count; i = i + 1) {
        local base: int = entries[i].bars.len - periods - 1;
        loop (local t: int = 0; t < periods; t = t + 1) {
            panel.put(i, t, Math.log(entries[i].bars.close[base + t + 1] / entries[i].bars.close[base + t]));
        }
        mu[i] = -panel.mean(i);
    }
    local cov: Matrix = Covariance.sample(&panel);
    cov.scaleInPlace(aversion);
    local lo: *float = cast<*float>(malloc(cast<long>(count) * sizeof(float)));
    local hi: *float = cast<*float>(malloc(cast<long>(count) * sizeof(float)));
    loop (local i: int = 0; i < count; i = i + 1) {
        lo[i] = min_weight;
        hi[i] = max_weight;
    }
    local started: long = Clock.nowNs();
    local r: QpResult = BoxQp.solve(&cov, mu, lo, hi, 1.0, 50000);
    cov.scaleInPlace(1.0 / aversion);
    local w: JsonWriter = JsonWriter.new(1024);
    w.precision = 10;
    w.beginObject();
    w.fieldBool("converged", r.converged);
    w.fieldInt("iterations", cast<long>(r.iterations));
    w.key("weights").beginArray();
    local total_ret: float = 0.0;
    loop (local i: int = 0; i < count; i = i + 1) {
        w.num(r.x[i]);
        total_ret = total_ret - (mu[i] * r.x[i]);
    }
    w.endArray();
    w.fieldNum("expected_return_annual", total_ret * 252.0);
    w.fieldNum("volatility_annual", Math.sqrt(cov.quadForm(r.x) * 252.0));
    w.fieldFixed("elapsed_ms", Clock.elapsedMs(started), 3);
    w.endObject();
    r.destroy();
    cov.destroy();
    panel.destroy();
    free(cast<*void>(mu));
    free(cast<*void>(lo));
    free(cast<*void>(hi));
    Reply.ok(res, &w);
    w.destroy();
}
