# Time-series endpoints: bars, indicators, volatility, CSV export.

import [Request], [Response] from "bpl-express";
import [StringBuilder] from "std/string_builder.bpl";
import [Array] from "std/array.bpl";
import [CSV] from "bpl-csv";
import [Math] from "std/math.bpl";
import malloc, free, snprintf from "std/c.bpl";
import [JsonWriter] from "../core/json_writer.bpl";
import [Text] from "../core/text.bpl";
import [AppState], appState from "./state.bpl";
import [Reply] from "./respond.bpl";
import [Params], [Page] from "./params.bpl";
import [Filter], [FValue], [FilterSchema] from "./filter.bpl";
import [Bar], [BarSeries] from "../series/bars.bpl";
import [SeriesEntry] from "../series/store.bpl";
import [Indicators], [MacdOut], [BandsOut], [StochOut], [AdxOut], [IchimokuOut] from "../series/indicators.bpl";
import [Stats], [Moments] from "../math/stats.bpl";

export barsHandler;
export barsCsvHandler;
export syntheticBarsHandler;
export appendBarHandler;
export indicatorHandler;
export indicatorSummaryHandler;
export volatilityHandler;
export returnsHandler;
export seriesListHandler;

global bar_field_names: string[7] = ["time", "open", "high", "low", "close", "volume", "vwap"];

frame barField(s: *BarSeries, i: int, field: int) ret FValue {
    if (field == 0) {
        return FValue.number(cast<float>(s.time[i]));
    }
    if (field == 1) {
        return FValue.number(s.open[i]);
    }
    if (field == 2) {
        return FValue.number(s.high[i]);
    }
    if (field == 3) {
        return FValue.number(s.low[i]);
    }
    if (field == 4) {
        return FValue.number(s.close[i]);
    }
    if (field == 5) {
        return FValue.number(s.volume[i]);
    }
    return FValue.number(s.vwap[i]);
}

frame entryFor(req: *Request, res: *Response) ret *SeriesEntry {
    local p: Params = Params.of(req);
    local symbol: string = p.path("symbol");
    local s: *AppState = appState();
    local e: *SeriesEntry = s.series.find(symbol);
    if (e == nullptr) {
        Reply.notFound(res, "no series for symbol");
    }
    return e;
}

frame writeBar(w: *JsonWriter, s: *BarSeries, i: int) {
    w.beginObject();
    w.fieldInt("time", s.time[i]);
    w.fieldFixed("open", s.open[i], 4);
    w.fieldFixed("high", s.high[i], 4);
    w.fieldFixed("low", s.low[i], 4);
    w.fieldFixed("close", s.close[i], 4);
    w.fieldFixed("volume", s.volume[i], 0);
    w.fieldFixed("vwap", s.vwap[i], 4);
    w.endObject();
}

frame seriesListHandler(_req: *Request, res: *Response) {
    local s: *AppState = appState();
    local w: JsonWriter = JsonWriter.new(512);
    w.beginObject();
    w.key("series").beginArray();
    loop (local i: int = 0; i < s.series.count; i = i + 1) {
        local e: *SeriesEntry = s.series.entries + i;
        w.beginObject();
        w.fieldStr("symbol", s.series.symbolAt(i));
        w.fieldInt("bars", cast<long>(e.bars.len));
        if (e.bars.len > 0) {
            w.fieldInt("first", e.bars.time[0]);
            w.fieldInt("last", e.bars.time[e.bars.len - 1]);
            w.fieldFixed("close", e.bars.close[e.bars.len - 1], 4);
        }
        w.endObject();
    }
    w.endArray();
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

# Selects bars by time range, optional resampling and filter; writes indexes into a new series.
frame selectBars(req: *Request, res: *Response, e: *SeriesEntry, out: *BarSeries) ret bool {
    local p: Params = Params.of(req);
    local from_t: long = p.longInt("from", -9223372036854775807, -9223372036854775807, 9223372036854775807);
    local to_t: long = p.longInt("to", 9223372036854775807, -9223372036854775807, 9223372036854775807);
    local interval: long = p.longInt("interval", 0, 0, 31536000);
    local filter_text: string = p.str("filter", nullptr);
    if (p.reject(res)) {
        return false;
    }
    local source: BarSeries = e.bars;
    local resampled: bool = false;
    if ((interval > 0) && (interval > e.bars.interval)) {
        source = e.bars.resample(interval);
        resampled = true;
    }
    local f: Filter = Filter.compile(Text.isEmpty(filter_text) ? "true" : filter_text, FilterSchema.new(&bar_field_names[0], 7));
    if (!f.ok()) {
        Reply.errorDetail(res, 400, "invalid filter", f.error);
        f.destroy();
        if (resampled) {
            source.destroy();
        }
        return false;
    }
    *out = BarSeries.new(64, source.interval);
    local start: int = source.indexAtOrAfter(from_t);
    loop (local i: int = start; (i < source.len) && (source.time[i] <= to_t); i = i + 1) {
        local src: *BarSeries = &source;
        local idx: int = i;
        local get: Lambda<FValue>(int) = |field: int| ret FValue {
            return barField(src, idx, field);
        };
        if (f.matches(get)) {
            out.push(source.at(i));
        }
    }
    f.destroy();
    if (resampled) {
        source.destroy();
    }
    return true;
}

frame barsHandler(req: *Request, res: *Response) {
    local e: *SeriesEntry = entryFor(req, res);
    if (e == nullptr) {
        return;
    }
    local p: Params = Params.of(req);
    local page: Page = p.page(100, 5000);
    if (p.reject(res)) {
        return;
    }
    local sel: BarSeries;
    if (!selectBars(req, res, e, &sel)) {
        return;
    }
    local w: JsonWriter = JsonWriter.new(256 + (sel.len * 120));
    w.beginObject();
    w.fieldInt("total", cast<long>(sel.len));
    w.fieldInt("offset", cast<long>(page.offset));
    w.fieldInt("interval", sel.interval);
    w.key("bars").beginArray();
    local end: int = page.offset + page.limit;
    if (end > sel.len) {
        end = sel.len;
    }
    loop (local i: int = page.offset; i < end; i = i + 1) {
        writeBar(&w, &sel, i);
    }
    w.endArray();
    if (end < sel.len) {
        w.fieldInt("next_offset", cast<long>(end));
    }
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
    sel.destroy();
}

frame barsCsvHandler(req: *Request, res: *Response) {
    local e: *SeriesEntry = entryFor(req, res);
    if (e == nullptr) {
        return;
    }
    local sel: BarSeries;
    if (!selectBars(req, res, e, &sel)) {
        return;
    }
    local out: StringBuilder = StringBuilder.new(128 + (sel.len * 80));
    local header: Array<string> = Array<string>.new(7);
    loop (local i: int = 0; i < 7; i = i + 1) {
        header.push(bar_field_names[i]);
    }
    CSV.row(&out, &header, false);
    header.destroy();
    local buf: char[64];
    loop (local i: int = 0; i < sel.len; i = i + 1) {
        snprintf(cast<string>(&buf[0]), 64, "%lld", sel.time[i]);
        CSV.field(&out, cast<string>(&buf[0]), false);
        local values: float[6] = [sel.open[i], sel.high[i], sel.low[i], sel.close[i], sel.volume[i], sel.vwap[i]];
        loop (local k: int = 0; k < 6; k = k + 1) {
            out.append(",");
            snprintf(cast<string>(&buf[0]), 64, "%.4f", values[k]);
            CSV.field(&out, cast<string>(&buf[0]), false);
        }
        out.append("\r\n");
    }
    Reply.csv(res, "bars.csv", &out);
    out.destroy();
    sel.destroy();
}

frame syntheticBarsHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local symbol: string = p.path("symbol");
    if (!Text.isSymbol(symbol)) {
        p.fail("symbol", "invalid symbol");
    }
    local count: int = p.integer("count", 252, 2, 100000);
    local start: float = p.num("start", 100.0, 0.01, 1000000.0);
    local drift: float = p.num("drift", 0.05, -2.0, 2.0);
    local vol: float = p.num("vol", 0.2, 0.001, 5.0);
    local interval: long = p.longInt("interval", 86400, 1, 31536000);
    local seed: long = p.longInt("seed", 1, 0, 9223372036854775807);
    if (p.reject(res)) {
        return;
    }
    local s: *AppState = appState();
    local bars: BarSeries = BarSeries.synthetic(cast<u64>(seed), count, start, drift, vol, interval);
    local last: float = bars.close[bars.len - 1];
    s.series.load(symbol, bars);
    local w: JsonWriter = JsonWriter.new(128);
    w.beginObject().fieldStr("symbol", symbol).fieldInt("bars", cast<long>(count)).fieldFixed("last_close", last, 4).endObject();
    Reply.json(res, 201, &w);
    w.destroy();
}

frame appendBarHandler(req: *Request, res: *Response) {
    local p: Params = Params.of(req);
    local owner: *Params = &p;
    defer owner.destroy();
    local symbol: string = p.path("symbol");
    if (!Text.isSymbol(symbol)) {
        p.fail("symbol", "invalid symbol");
    }
    p.parseBody(4096);
    if (p.reject(res)) {
        return;
    }
    local b: Bar;
    b.time = p.longInt("time", 0, 0, 9223372036854775807);
    b.open = p.requiredNum("open", 0.0, 100000000.0);
    b.high = p.requiredNum("high", 0.0, 100000000.0);
    b.low = p.requiredNum("low", 0.0, 100000000.0);
    b.close = p.requiredNum("close", 0.0, 100000000.0);
    b.volume = p.num("volume", 0.0, 0.0, 1000000000000.0);
    b.trades = p.longInt("trades", 0, 0, 1000000000);
    b.vwap = p.num("vwap", b.close, 0.0, 100000000.0);
    if (p.ok() && ((b.high < b.low) || (b.open > b.high) || (b.open < b.low) || (b.close > b.high) || (b.close < b.low))) {
        p.fail("high", "bar must satisfy low <= open, close <= high");
    }
    if (p.reject(res)) {
        return;
    }
    local s: *AppState = appState();
    if (!s.series.append(symbol, b)) {
        Reply.error(res, 409, "bar time must be after the last bar");
        return;
    }
    local e: *SeriesEntry = s.series.find(symbol);
    local w: JsonWriter = JsonWriter.new(64);
    w.beginObject().fieldStr("symbol", symbol).fieldInt("bars", cast<long>(e.bars.len)).endObject();
    Reply.json(res, 201, &w);
    w.destroy();
}

frame tailArray(w: *JsonWriter, name: string, x: *float, n: int, tail: int) {
    w.key(name).beginArray();
    local start: int = (n - tail) < 0 ? 0 : n - tail;
    loop (local i: int = start; i < n; i = i + 1) {
        w.num(x[i]);
    }
    w.endArray();
}

global indicator_names: string[22] = ["sma", "ema", "wma", "hma", "dema", "tema", "kama", "rsi", "macd", "bollinger", "atr", "keltner", "donchian", "stochastic", "williams_r", "cci", "adx", "obv", "mfi", "vwap", "psar", "ichimoku"];

frame indicatorHandler(req: *Request, res: *Response) {
    local e: *SeriesEntry = entryFor(req, res);
    if (e == nullptr) {
        return;
    }
    local p: Params = Params.of(req);
    local name: string = p.oneOf("name", "sma", &indicator_names[0], 22);
    local period: int = p.integer("period", 14, 2, 1000);
    local tail: int = p.integer("tail", 50, 1, 100000);
    local mult: float = p.num("k", 2.0, 0.1, 10.0);
    if (p.reject(res)) {
        return;
    }
    local s: *BarSeries = &e.bars;
    local n: int = s.len;
    if (n < (period + 1)) {
        Reply.error(res, 422, "not enough bars for this period");
        return;
    }
    local w: JsonWriter = JsonWriter.new(1024 + (tail * 60));
    w.precision = 8;
    w.beginObject();
    w.fieldStr("indicator", name);
    w.fieldInt("period", cast<long>(period));
    w.fieldInt("bars", cast<long>(n));
    local out: *float = Indicators.alloc(n);
    if (Text.equals(name, "macd")) {
        local m: MacdOut = Indicators.macd(s.close, n, 12, 26, 9);
        tailArray(&w, "macd", m.macd, n, tail);
        tailArray(&w, "signal", m.signal, n, tail);
        tailArray(&w, "histogram", m.histogram, n, tail);
        m.destroy();
    } else if (Text.equals(name, "bollinger") || Text.equals(name, "keltner") || Text.equals(name, "donchian")) {
        local b: BandsOut;
        if (Text.equals(name, "bollinger")) {
            b = Indicators.bollinger(s.close, n, period, mult);
        } else if (Text.equals(name, "keltner")) {
            b = Indicators.keltner(s, period, mult);
        } else {
            b = Indicators.donchian(s, period);
        }
        tailArray(&w, "upper", b.upper, n, tail);
        tailArray(&w, "middle", b.middle, n, tail);
        tailArray(&w, "lower", b.lower, n, tail);
        tailArray(&w, "width", b.width, n, tail);
        b.destroy();
    } else if (Text.equals(name, "stochastic")) {
        local st: StochOut = Indicators.stochastic(s, period, 3);
        tailArray(&w, "k", st.k, n, tail);
        tailArray(&w, "d", st.d, n, tail);
        st.destroy();
    } else if (Text.equals(name, "adx")) {
        local a: AdxOut = Indicators.adx(s, period);
        tailArray(&w, "adx", a.adx, n, tail);
        tailArray(&w, "plus_di", a.plus_di, n, tail);
        tailArray(&w, "minus_di", a.minus_di, n, tail);
        a.destroy();
    } else if (Text.equals(name, "ichimoku")) {
        local ich: IchimokuOut = Indicators.ichimoku(s, 9, 26, 52);
        tailArray(&w, "tenkan", ich.tenkan, n, tail);
        tailArray(&w, "kijun", ich.kijun, n, tail);
        tailArray(&w, "span_a", ich.span_a, n, tail);
        tailArray(&w, "span_b", ich.span_b, n, tail);
        ich.destroy();
    } else {
        if (Text.equals(name, "sma")) {
            Indicators.sma(s.close, n, period, out);
        } else if (Text.equals(name, "ema")) {
            Indicators.ema(s.close, n, period, out);
        } else if (Text.equals(name, "wma")) {
            Indicators.wma(s.close, n, period, out);
        } else if (Text.equals(name, "hma")) {
            Indicators.hma(s.close, n, period, out);
        } else if (Text.equals(name, "dema")) {
            Indicators.dema(s.close, n, period, out);
        } else if (Text.equals(name, "tema")) {
            Indicators.tema(s.close, n, period, out);
        } else if (Text.equals(name, "kama")) {
            Indicators.kama(s.close, n, period, 2, 30, out);
        } else if (Text.equals(name, "rsi")) {
            Indicators.rsi(s.close, n, period, out);
        } else if (Text.equals(name, "atr")) {
            Indicators.atr(s, period, out);
        } else if (Text.equals(name, "williams_r")) {
            Indicators.williamsR(s, period, out);
        } else if (Text.equals(name, "cci")) {
            Indicators.cci(s, period, out);
        } else if (Text.equals(name, "obv")) {
            Indicators.obv(s, out);
        } else if (Text.equals(name, "mfi")) {
            Indicators.mfi(s, period, out);
        } else if (Text.equals(name, "vwap")) {
            Indicators.rollingVwap(s, period, out);
        } else {
            Indicators.parabolicSar(s, 0.02, 0.2, out);
        }
        tailArray(&w, "values", out, n, tail);
        w.fieldNum("last", Indicators.lastValid(out, n));
        w.fieldInt("first_valid", cast<long>(Indicators.firstValid(out, n)));
    }
    free(cast<*void>(out));
    w.endObject();
    Reply.ok(res, &w);
    w.destroy();
}

# Last value of every indicator: a dashboard-style summary.
frame indicatorSummaryHandler(req: *Request, res: *Response) {
    local e: *SeriesEntry = entryFor(req, res);
    if (e == nullptr) {
        return;
    }
    local s: *BarSeries = &e.bars;
    local n: int = s.len;
    if (n < 60) {
        Reply.error(res, 422, "summary needs at least 60 bars");
        return;
    }
    local out: *float = Indicators.alloc(n);
    local w: JsonWriter = JsonWriter.new(1024);
    w.precision = 8;
    w.beginObject();
    w.fieldFixed("close", s.close[n - 1], 4);
    Indicators.sma(s.close, n, 20, out);
    w.fieldNum("sma20", out[n - 1]);
    Indicators.sma(s.close, n, 50, out);
    w.fieldNum("sma50", out[n - 1]);
    Indicators.ema(s.close, n, 20, out);
    w.fieldNum("ema20", out[n - 1]);
    Indicators.rsi(s.close, n, 14, out);
    w.fieldNum("rsi14", out[n - 1]);
    local trend: string = "neutral";
    if (out[n - 1] > 70.0) {
        trend = "overbought";
    } else if (out[n - 1] < 30.0) {
        trend = "oversold";
    }
    w.fieldStr("rsi_state", trend);
    local m: MacdOut = Indicators.macd(s.close, n, 12, 26, 9);
    w.fieldNum("macd", m.macd[n - 1]);
    w.fieldNum("macd_signal", m.signal[n - 1]);
    w.fieldStr("macd_bias", m.histogram[n - 1] > 0.0 ? "bullish" : "bearish");
    m.destroy();
    local bb: BandsOut = Indicators.bollinger(s.close, n, 20, 2.0);
    w.fieldNum("bb_upper", bb.upper[n - 1]);
    w.fieldNum("bb_lower", bb.lower[n - 1]);
    w.fieldNum("bb_percent_b", bb.percent_b[n - 1]);
    bb.destroy();
    Indicators.atr(s, 14, out);
    w.fieldNum("atr14", out[n - 1]);
    local adx: AdxOut = Indicators.adx(s, 14);
    w.fieldNum("adx14", adx.adx[n - 1]);
    adx.destroy();
    local st: StochOut = Indicators.stochastic(s, 14, 3);
    w.fieldNum("stoch_k", st.k[n - 1]);
    st.destroy();
    Indicators.cci(s, 20, out);
    w.fieldNum("cci20", out[n - 1]);
    Indicators.mfi(s, 14, out);
    w.fieldNum("mfi14", out[n - 1]);
    Indicators.realizedVol(s.close, n, 20, 252.0, out);
    w.fieldNum("realized_vol20", out[n - 1]);
    Indicators.parabolicSar(s, 0.02, 0.2, out);
    w.fieldNum("psar", out[n - 1]);
    w.endObject();
    free(cast<*void>(out));
    Reply.ok(res, &w);
    w.destroy();
}

frame volatilityHandler(req: *Request, res: *Response) {
    local e: *SeriesEntry = entryFor(req, res);
    if (e == nullptr) {
        return;
    }
    local p: Params = Params.of(req);
    local window: int = p.integer("window", 20, 2, 1000);
    local annual: float = p.num("periods_per_year", 252.0, 1.0, 1000000.0);
    if (p.reject(res)) {
        return;
    }
    local s: *BarSeries = &e.bars;
    local n: int = s.len;
    if (n < (window + 2)) {
        Reply.error(res, 422, "not enough bars for this window");
        return;
    }
    local out: *float = Indicators.alloc(n);
    local w: JsonWriter = JsonWriter.new(512);
    w.precision = 8;
    w.beginObject();
    w.fieldInt("window", cast<long>(window));
    Indicators.realizedVol(s.close, n, window, annual, out);
    w.fieldNum("close_to_close", out[n - 1]);
    Indicators.parkinsonVol(s, window, annual, out);
    w.fieldNum("parkinson", out[n - 1]);
    Indicators.garmanKlassVol(s, window, annual, out);
    w.fieldNum("garman_klass", out[n - 1]);
    local rets: *float = Indicators.alloc(n);
    loop (local i: int = 1; i < n; i = i + 1) {
        rets[i - 1] = Math.log(s.close[i] / s.close[i - 1]);
    }
    w.fieldNum("ewma_94", Math.sqrt(Stats.ewmaVariance(rets, n - 1, 0.94) * annual));
    w.fieldNum("full_sample", Stats.stddev(rets, n - 1) * Math.sqrt(annual));
    w.endObject();
    free(cast<*void>(out));
    free(cast<*void>(rets));
    Reply.ok(res, &w);
    w.destroy();
}

frame returnsHandler(req: *Request, res: *Response) {
    local e: *SeriesEntry = entryFor(req, res);
    if (e == nullptr) {
        return;
    }
    local s: *BarSeries = &e.bars;
    local n: int = s.len;
    if (n < 3) {
        Reply.error(res, 422, "not enough bars");
        return;
    }
    local rets: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    local equity: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
    loop (local i: int = 1; i < n; i = i + 1) {
        rets[i - 1] = (s.close[i] / s.close[i - 1]) - 1.0;
    }
    loop (local i: int = 0; i < n; i = i + 1) {
        equity[i] = s.close[i];
    }
    local m: Moments = Stats.moments(rets, n - 1);
    local w: JsonWriter = JsonWriter.new(512);
    w.precision = 8;
    w.beginObject();
    w.fieldInt("observations", cast<long>(n - 1));
    w.fieldNum("mean", m.mean);
    w.fieldNum("stddev", m.stddev);
    w.fieldNum("skewness", m.skewness);
    w.fieldNum("kurtosis", m.kurtosis);
    w.fieldNum("min", m.min);
    w.fieldNum("max", m.max);
    w.fieldNum("sharpe", Stats.sharpe(rets, n - 1, 0.0, 252.0));
    w.fieldNum("sortino", Stats.sortino(rets, n - 1, 0.0, 252.0));
    w.fieldNum("max_drawdown", Stats.maxDrawdown(equity, n));
    w.fieldNum("total_return", (s.close[n - 1] / s.close[0]) - 1.0);
    w.fieldNum("acf1", Stats.autocorrelation(rets, n - 1, 1));
    w.fieldNum("ljung_box_10", Stats.ljungBox(rets, n - 1, 10));
    w.fieldNum("hurst", Stats.hurst(rets, n - 1));
    w.endObject();
    free(cast<*void>(rets));
    free(cast<*void>(equity));
    Reply.ok(res, &w);
    w.destroy();
}
