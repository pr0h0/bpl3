# Routes for the second indicator set and the extra statistics.

import malloc, free from "std/c.bpl";
import [Request], [Response] from "bpl-express";
import [JsonWriter] from "../core/json_writer.bpl";
import [JsonKind] from "../core/json_doc.bpl";
import [Text] from "../core/text.bpl";
import [AppState], appState from "./state.bpl";
import [Reply] from "./respond.bpl";
import [Params] from "./params.bpl";
import [SeriesEntry] from "../series/store.bpl";
import [BarSeries] from "../series/bars.bpl";
import [Indicators] from "../series/indicators.bpl";
import [MoreIndicators], [SuperTrendOut], [Pivots] from "../series/indicators2.bpl";
import [Stats2], [TestResult], [DrawdownTable] from "../math/stats2.bpl";
import [Stats] from "../math/stats.bpl";

export moreIndicatorHandler;
export moreIndicatorListHandler;
export performanceHandler;
export sampleTestsHandler;

frame moreIndicatorListHandler(_req: *Request, res: *Response) {
    local w: JsonWriter = JsonWriter.new(1024);
    w.beginObject();
    w.key("indicators").beginArray();
    loop (local i: int = 0; i < MoreIndicators.count(); i = i + 1) {
        w.str(MoreIndicators.name(i));
    }
    w.str("supertrend");
    w.str("pivots");
    w.endArray();
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

frame findSeries(req: *Request, res: *Response) ret *BarSeries {
    local p: Params = Params.of(req);
    local s: *AppState = appState();
    local e: *SeriesEntry = s.series.find(p.path("symbol"));
    if ((e == nullptr) || (e.bars.len < 2)) {
        Reply.notFound(res, "unknown symbol or no history");
        return nullptr;
    }
    return &e.bars;
}

# ?name=&period=&tail= (tail limits the output to the last N bars).
frame moreIndicatorHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local name: string = p.requiredStr("name", 32);
    local period: int = p.integer("period", 14, 2, 500);
    local tail: int = p.integer("tail", 50, 1, 100000);
    local mult: float = p.num("multiplier", 3.0, 0.1, 20.0);
    if (p.reject(res)) {
        return;
    }
    local bars: *BarSeries = findSeries(req, res);
    if (bars == nullptr) {
        return;
    }
    local n: int = bars.len;
    local start: int = n > tail ? n - tail : 0;
    local w: JsonWriter = JsonWriter.new(512 + ((n - start) * 48));
    w.precision = 10;
    w.beginObject();
    w.fieldStr("indicator", name);
    w.fieldInt("period", cast<long>(period));
    w.fieldInt("bars", cast<long>(n));
    w.fieldInt("from", bars.time[start]);
    local out: *float = Indicators.alloc(n);
    local single: bool = MoreIndicators.compute(name, bars, period, out);
    if (single) {
        w.fieldNumArray("values", out + start, n - start);
    }
    free(cast<*void>(out));
    if (!single) {
        # Not a single-series indicator; try the structured ones.
        if (Text.equals(name, "supertrend")) {
            local st: SuperTrendOut = MoreIndicators.superTrend(bars, period, mult);
            w.fieldNumArray("line", st.line + start, n - start);
            w.fieldNumArray("direction", st.direction + start, n - start);
            st.destroy();
        } else if (Text.equals(name, "pivots")) {
            local last: int = n - 1;
            local pv: Pivots = MoreIndicators.pivots(bars.high[last], bars.low[last], bars.close[last]);
            w.key("pivots").beginObject();
            w.fieldNum("pivot", pv.pivot).fieldNum("r1", pv.r1).fieldNum("r2", pv.r2).fieldNum("r3", pv.r3);
            w.fieldNum("s1", pv.s1).fieldNum("s2", pv.s2).fieldNum("s3", pv.s3);
            w.endObject();
        } else {
            w.destroy();
            Reply.error(res, 422, "unknown indicator (see /api/indicators2)");
            return;
        }
    }
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

# Return-based performance statistics of a symbol's closes.
frame performanceHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local periods: float = p.num("periods_per_year", 252.0, 1.0, 100000.0);
    local threshold: float = p.num("threshold", 0.0, -1.0, 1.0);
    local trials: int = p.integer("trials", 10, 1, 100000);
    local confidence: float = p.num("confidence", 0.99, 0.5, 0.9999);
    if (p.reject(res)) {
        return;
    }
    local bars: *BarSeries = findSeries(req, res);
    if (bars == nullptr) {
        return;
    }
    local n: int = bars.len - 1;
    if (n < 30) {
        Reply.error(res, 422, "need at least 31 bars");
        return;
    }
    local r: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    loop (local i: int = 0; i < n; i = i + 1) {
        r[i] = (bars.close[i + 1] / bars.close[i]) - 1.0;
    }
    local skew: float = 0.0;
    local kurt: float = 0.0;
    Stats2.skewKurt(r, n, &skew, &kurt);
    local w: JsonWriter = JsonWriter.new(2048);
    w.precision = 10;
    w.beginObject();
    w.fieldInt("returns", cast<long>(n));
    w.fieldNum("mean", Stats2.mean(r, n));
    w.fieldNum("stdev", Stats2.stdev(r, n));
    w.fieldNum("skew", skew);
    w.fieldNum("kurtosis", kurt);
    w.fieldNum("omega", Stats2.omega(r, n, threshold));
    w.fieldNum("calmar", Stats2.calmar(r, n, periods));
    w.fieldNum("kappa2", Stats2.kappa(r, n, threshold, 2.0));
    w.fieldNum("kappa3", Stats2.kappa(r, n, threshold, 3.0));
    w.fieldNum("tail_ratio", Stats2.tailRatio(r, n));
    w.fieldNum("probabilistic_sharpe", Stats2.probabilisticSharpe(r, n, 0.0));
    local sd: float = Stats2.stdev(r, n);
    local sr: float = sd > 0.0 ? Stats2.mean(r, n) / sd : 0.0;
    w.fieldNum("deflated_sharpe", Stats2.deflatedSharpe(r, n, trials, (sr * sr) + (1.0 / cast<float>(n))));
    w.fieldNum("hill_tail_index", Stats2.hill(r, n, (n / 10) > 5 ? n / 10 : 5));
    w.fieldNum("cornish_fisher_var", Stats2.cornishFisherVar(r, n, confidence));
    w.fieldNum("historical_var", -Stats.quantile(r, n, 1.0 - confidence));
    local ad: TestResult = Stats2.andersonDarling(r, n);
    local ks: TestResult = Stats2.ksNormal(r, n);
    w.key("normality").beginObject();
    w.fieldNum("anderson_darling", ad.statistic).fieldNum("anderson_darling_p", ad.p_value);
    w.fieldNum("ks", ks.statistic).fieldNum("ks_p", ks.p_value);
    w.endObject();
    local dd: DrawdownTable = Stats2.drawdowns(bars.close, bars.len);
    w.key("drawdowns").beginArray();
    loop (local i: int = 0; i < dd.count; i = i + 1) {
        w.beginObject();
        w.fieldNum("depth", dd.items[i].depth);
        w.fieldInt("peak_time", bars.time[dd.items[i].start]);
        w.fieldInt("trough_time", bars.time[dd.items[i].trough]);
        if (dd.items[i].end >= 0) {
            w.fieldInt("recovered_time", bars.time[dd.items[i].end]);
            w.fieldInt("bars", cast<long>(dd.items[i].end - dd.items[i].start));
        } else {
            w.fieldNull("recovered_time");
        }
        w.endObject();
    }
    w.endArray();
    w.fieldInt("longest_drawdown_bars", cast<long>(dd.max_duration));
    w.fieldNum("time_under_water", dd.time_under_water);
    w.endObject();
    free(cast<*void>(r));
    Reply.ok(res, &w);
    w.destroy();
}

# Body: {"a":[...], "b":[...]} -> two-sample KS, Mann-Whitney, and Kendall
# tau when the samples have equal length.
frame sampleTestsHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    if (!p.parseBody(4194304)) {
        p.reject(res);
        return;
    }
    local root: int = p.body.root();
    local an: int = p.body.get(root, "a");
    local bn: int = p.body.get(root, "b");
    if (!p.body.isKind(an, JsonKind.Array) || !p.body.isKind(bn, JsonKind.Array)) {
        Reply.error(res, 422, "a and b must be numeric arrays");
        return;
    }
    local na: int = p.body.length(an);
    local nb: int = p.body.length(bn);
    if ((na < 5) || (nb < 5) || (na > 100000) || (nb > 100000)) {
        Reply.error(res, 422, "each sample needs 5-100000 values");
        return;
    }
    local a: *float = cast<*float>(malloc(cast<long>(na + nb) * sizeof(float)));
    local b: *float = a + na;
    if ((p.body.numbers(an, a, na) != na) || (p.body.numbers(bn, b, nb) != nb)) {
        free(cast<*void>(a));
        Reply.error(res, 422, "samples must contain only numbers");
        return;
    }
    local ks: TestResult = Stats2.ks2(a, na, b, nb);
    local mw: TestResult = Stats2.mannWhitney(a, na, b, nb);
    local w: JsonWriter = JsonWriter.new(512);
    w.precision = 10;
    w.beginObject();
    w.key("ks").beginObject().fieldNum("d", ks.statistic).fieldNum("p_value", ks.p_value).endObject();
    w.key("mann_whitney").beginObject().fieldNum("u", mw.statistic).fieldNum("p_value", mw.p_value).endObject();
    if ((na == nb) && (na <= 5000)) {
        local kt: TestResult = Stats2.kendall(a, b, na);
        w.key("kendall").beginObject().fieldNum("tau", kt.statistic).fieldNum("p_value", kt.p_value).endObject();
    }
    local ada: TestResult = Stats2.andersonDarling(a, na);
    local adb: TestResult = Stats2.andersonDarling(b, nb);
    w.key("normality_p").beginObject().fieldNum("a", ada.p_value).fieldNum("b", adb.p_value).endObject();
    w.endObject();
    free(cast<*void>(a));
    Reply.ok(res, &w);
    w.destroy();
}
