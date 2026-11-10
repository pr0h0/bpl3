# Technical indicators over bar series.
#
# Every function writes one output per input bar. Bars before the indicator
# has enough history hold NaN, so outputs line up with their inputs and JSON
# encodes the warm-up period as null.

import [Math] from "std/math.bpl";
import malloc, free from "std/c.bpl";
import [BarSeries] from "./bars.bpl";
import [RollingWindow] from "./rolling.bpl";

export [Indicators];
export [MacdOut];
export [BandsOut];
export [StochOut];
export [AdxOut];
export [IchimokuOut];

global const NAN_BITS: u64 = 0x7FF8000000000000;

struct MacdOut {
    macd: *float,
    signal: *float,
    histogram: *float,
    n: int,

    frame destroy(this: *MacdOut) {
        free(cast<*void>(this.macd));
        free(cast<*void>(this.signal));
        free(cast<*void>(this.histogram));
    }
}

struct BandsOut {
    upper: *float,
    middle: *float,
    lower: *float,
    width: *float,
    percent_b: *float,
    n: int,

    frame destroy(this: *BandsOut) {
        free(cast<*void>(this.upper));
        free(cast<*void>(this.middle));
        free(cast<*void>(this.lower));
        free(cast<*void>(this.width));
        free(cast<*void>(this.percent_b));
    }
}

struct StochOut {
    k: *float,
    d: *float,
    n: int,

    frame destroy(this: *StochOut) {
        free(cast<*void>(this.k));
        free(cast<*void>(this.d));
    }
}

struct AdxOut {
    adx: *float,
    plus_di: *float,
    minus_di: *float,
    n: int,

    frame destroy(this: *AdxOut) {
        free(cast<*void>(this.adx));
        free(cast<*void>(this.plus_di));
        free(cast<*void>(this.minus_di));
    }
}

struct IchimokuOut {
    tenkan: *float,
    kijun: *float,
    span_a: *float,
    span_b: *float,
    n: int,

    frame destroy(this: *IchimokuOut) {
        free(cast<*void>(this.tenkan));
        free(cast<*void>(this.kijun));
        free(cast<*void>(this.span_a));
        free(cast<*void>(this.span_b));
    }
}

struct Indicators {
    frame nan() ret float {
        local bits: u64 = NAN_BITS;
        return *cast<*float>(&bits);
    }

    frame alloc(n: int) ret *float {
        local out: *float = cast<*float>(malloc(cast<long>(n + 1) * sizeof(float)));
        local q: float = Indicators.nan();
        loop (local i: int = 0; i < n; i = i + 1) {
            out[i] = q;
        }
        return out;
    }

    frame isNan(x: float) ret bool {
        return x != x;
    }

    # Simple moving average.
    frame sma(x: *float, n: int, period: int, out: *float) {
        local sum: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            sum = sum + x[i];
            if (i >= period) {
                sum = sum - x[i - period];
            }
            out[i] = i >= (period - 1) ? sum / cast<float>(period) : Indicators.nan();
        }
    }

    # Exponential moving average seeded with the SMA of the first period.
    frame ema(x: *float, n: int, period: int, out: *float) {
        local alpha: float = 2.0 / (cast<float>(period) + 1.0);
        local seed: float = 0.0;
        local value: float = 0.0;
        local started: int = 0;
        loop (local i: int = 0; i < n; i = i + 1) {
            if (Indicators.isNan(x[i])) {
                out[i] = Indicators.nan();
                continue;
            }
            if (started < period) {
                seed = seed + x[i];
                started = started + 1;
                if (started == period) {
                    value = seed / cast<float>(period);
                    out[i] = value;
                } else {
                    out[i] = Indicators.nan();
                }
                continue;
            }
            value = value + (alpha * (x[i] - value));
            out[i] = value;
        }
    }

    # Wilder smoothing (RMA): alpha = 1/period.
    frame rma(x: *float, n: int, period: int, out: *float) {
        local value: float = 0.0;
        local seed: float = 0.0;
        local started: int = 0;
        loop (local i: int = 0; i < n; i = i + 1) {
            if (Indicators.isNan(x[i])) {
                out[i] = Indicators.nan();
                continue;
            }
            if (started < period) {
                seed = seed + x[i];
                started = started + 1;
                out[i] = Indicators.nan();
                if (started == period) {
                    value = seed / cast<float>(period);
                    out[i] = value;
                }
                continue;
            }
            value = ((value * cast<float>(period - 1)) + x[i]) / cast<float>(period);
            out[i] = value;
        }
    }

    # Linearly weighted moving average.
    frame wma(x: *float, n: int, period: int, out: *float) {
        local denom: float = cast<float>(period * (period + 1)) / 2.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            if (i < (period - 1)) {
                out[i] = Indicators.nan();
                continue;
            }
            local s: float = 0.0;
            loop (local k: int = 0; k < period; k = k + 1) {
                s = s + (x[i - k] * cast<float>(period - k));
            }
            out[i] = s / denom;
        }
    }

    # Hull moving average: WMA(2 WMA(n/2) - WMA(n), sqrt(n)).
    frame hma(x: *float, n: int, period: int, out: *float) {
        local half: *float = Indicators.alloc(n);
        local full: *float = Indicators.alloc(n);
        local diff: *float = Indicators.alloc(n);
        Indicators.wma(x, n, period / 2, half);
        Indicators.wma(x, n, period, full);
        local start: int = -1;
        loop (local i: int = 0; i < n; i = i + 1) {
            if (!Indicators.isNan(full[i])) {
                diff[i] = (2.0 * half[i]) - full[i];
                if (start < 0) {
                    start = i;
                }
            }
        }
        local sq: int = cast<int>(Math.floor(Math.sqrt(cast<float>(period))));
        loop (local i: int = 0; i < n; i = i + 1) {
            out[i] = Indicators.nan();
        }
        if (start >= 0) {
            Indicators.wma(diff + start, n - start, sq, out + start);
        }
        free(cast<*void>(half));
        free(cast<*void>(full));
        free(cast<*void>(diff));
    }

    frame dema(x: *float, n: int, period: int, out: *float) {
        local e1: *float = Indicators.alloc(n);
        local e2: *float = Indicators.alloc(n);
        Indicators.ema(x, n, period, e1);
        Indicators.ema(e1, n, period, e2);
        loop (local i: int = 0; i < n; i = i + 1) {
            out[i] = (2.0 * e1[i]) - e2[i];
        }
        free(cast<*void>(e1));
        free(cast<*void>(e2));
    }

    frame tema(x: *float, n: int, period: int, out: *float) {
        local e1: *float = Indicators.alloc(n);
        local e2: *float = Indicators.alloc(n);
        local e3: *float = Indicators.alloc(n);
        Indicators.ema(x, n, period, e1);
        Indicators.ema(e1, n, period, e2);
        Indicators.ema(e2, n, period, e3);
        loop (local i: int = 0; i < n; i = i + 1) {
            out[i] = ((3.0 * e1[i]) - (3.0 * e2[i])) + e3[i];
        }
        free(cast<*void>(e1));
        free(cast<*void>(e2));
        free(cast<*void>(e3));
    }

    # Kaufman adaptive moving average.
    frame kama(x: *float, n: int, period: int, fast: int, slow: int, out: *float) {
        local fast_sc: float = 2.0 / (cast<float>(fast) + 1.0);
        local slow_sc: float = 2.0 / (cast<float>(slow) + 1.0);
        local value: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            if (i < period) {
                out[i] = Indicators.nan();
                value = x[i];
                continue;
            }
            local change: float = Math.abs(x[i] - x[i - period]);
            local volatility: float = 0.0;
            loop (local k: int = (i - period) + 1; k <= i; k = k + 1) {
                volatility = volatility + Math.abs(x[k] - x[k - 1]);
            }
            local er: float = volatility > 0.0 ? change / volatility : 0.0;
            local sc: float = (er * (fast_sc - slow_sc)) + slow_sc;
            sc = sc * sc;
            value = value + (sc * (x[i] - value));
            out[i] = value;
        }
    }

    # Relative strength index with Wilder smoothing.
    frame rsi(x: *float, n: int, period: int, out: *float) {
        local avg_gain: float = 0.0;
        local avg_loss: float = 0.0;
        out[0] = Indicators.nan();
        loop (local i: int = 1; i < n; i = i + 1) {
            local change: float = x[i] - x[i - 1];
            local gain: float = change > 0.0 ? change : 0.0;
            local loss: float = change < 0.0 ? -change : 0.0;
            if (i <= period) {
                avg_gain = avg_gain + gain;
                avg_loss = avg_loss + loss;
                if (i == period) {
                    avg_gain = avg_gain / cast<float>(period);
                    avg_loss = avg_loss / cast<float>(period);
                } else {
                    out[i] = Indicators.nan();
                    continue;
                }
            } else {
                avg_gain = ((avg_gain * cast<float>(period - 1)) + gain) / cast<float>(period);
                avg_loss = ((avg_loss * cast<float>(period - 1)) + loss) / cast<float>(period);
            }
            if (avg_loss == 0.0) {
                out[i] = avg_gain == 0.0 ? 50.0 : 100.0;
            } else {
                local rs: float = avg_gain / avg_loss;
                out[i] = 100.0 - (100.0 / (1.0 + rs));
            }
        }
    }

    frame macd(x: *float, n: int, fast: int, slow: int, signal: int) ret MacdOut {
        local r: MacdOut;
        r.n = n;
        r.macd = Indicators.alloc(n);
        r.signal = Indicators.alloc(n);
        r.histogram = Indicators.alloc(n);
        local ef: *float = Indicators.alloc(n);
        local es: *float = Indicators.alloc(n);
        Indicators.ema(x, n, fast, ef);
        Indicators.ema(x, n, slow, es);
        loop (local i: int = 0; i < n; i = i + 1) {
            r.macd[i] = ef[i] - es[i];
        }
        Indicators.ema(r.macd, n, signal, r.signal);
        loop (local i: int = 0; i < n; i = i + 1) {
            r.histogram[i] = r.macd[i] - r.signal[i];
        }
        free(cast<*void>(ef));
        free(cast<*void>(es));
        return r;
    }

    frame bollinger(x: *float, n: int, period: int, k: float) ret BandsOut {
        local r: BandsOut;
        r.n = n;
        r.upper = Indicators.alloc(n);
        r.middle = Indicators.alloc(n);
        r.lower = Indicators.alloc(n);
        r.width = Indicators.alloc(n);
        r.percent_b = Indicators.alloc(n);
        local w: RollingWindow = RollingWindow.new(period);
        loop (local i: int = 0; i < n; i = i + 1) {
            w.push(x[i]);
            if (w.full()) {
                local m: float = w.mean();
                local sd: float = w.populationStddev();
                r.middle[i] = m;
                r.upper[i] = m + (k * sd);
                r.lower[i] = m - (k * sd);
                r.width[i] = m != 0.0 ? (r.upper[i] - r.lower[i]) / m : 0.0;
                local span: float = r.upper[i] - r.lower[i];
                r.percent_b[i] = span > 0.0 ? (x[i] - r.lower[i]) / span : 0.5;
            }
            if ((i % 512) == 511) {
                w.resync();
            }
        }
        w.destroy();
        return r;
    }

    frame trueRange(s: *BarSeries, out: *float) {
        loop (local i: int = 0; i < s.len; i = i + 1) {
            out[i] = s.trueRange(i);
        }
    }

    frame atr(s: *BarSeries, period: int, out: *float) {
        local tr: *float = Indicators.alloc(s.len);
        Indicators.trueRange(s, tr);
        Indicators.rma(tr, s.len, period, out);
        free(cast<*void>(tr));
    }

    frame keltner(s: *BarSeries, period: int, mult: float) ret BandsOut {
        local n: int = s.len;
        local r: BandsOut;
        r.n = n;
        r.upper = Indicators.alloc(n);
        r.middle = Indicators.alloc(n);
        r.lower = Indicators.alloc(n);
        r.width = Indicators.alloc(n);
        r.percent_b = Indicators.alloc(n);
        local typical: *float = Indicators.alloc(n);
        loop (local i: int = 0; i < n; i = i + 1) {
            typical[i] = s.typicalPrice(i);
        }
        local a: *float = Indicators.alloc(n);
        Indicators.ema(typical, n, period, r.middle);
        Indicators.atr(s, period, a);
        loop (local i: int = 0; i < n; i = i + 1) {
            r.upper[i] = r.middle[i] + (mult * a[i]);
            r.lower[i] = r.middle[i] - (mult * a[i]);
            r.width[i] = (r.upper[i] - r.lower[i]) / r.middle[i];
            local span: float = r.upper[i] - r.lower[i];
            r.percent_b[i] = span > 0.0 ? (s.close[i] - r.lower[i]) / span : Indicators.nan();
        }
        free(cast<*void>(typical));
        free(cast<*void>(a));
        return r;
    }

    frame donchian(s: *BarSeries, period: int) ret BandsOut {
        local n: int = s.len;
        local r: BandsOut;
        r.n = n;
        r.upper = Indicators.alloc(n);
        r.middle = Indicators.alloc(n);
        r.lower = Indicators.alloc(n);
        r.width = Indicators.alloc(n);
        r.percent_b = Indicators.alloc(n);
        local hi: RollingWindow = RollingWindow.new(period);
        local lo: RollingWindow = RollingWindow.new(period);
        loop (local i: int = 0; i < n; i = i + 1) {
            hi.push(s.high[i]);
            lo.push(s.low[i]);
            if (hi.full()) {
                r.upper[i] = hi.max();
                r.lower[i] = lo.min();
                r.middle[i] = 0.5 * (r.upper[i] + r.lower[i]);
                r.width[i] = r.upper[i] - r.lower[i];
                r.percent_b[i] = r.width[i] > 0.0 ? (s.close[i] - r.lower[i]) / r.width[i] : 0.5;
            }
        }
        hi.destroy();
        lo.destroy();
        return r;
    }

    frame stochastic(s: *BarSeries, k_period: int, d_period: int) ret StochOut {
        local n: int = s.len;
        local r: StochOut;
        r.n = n;
        r.k = Indicators.alloc(n);
        r.d = Indicators.alloc(n);
        local hi: RollingWindow = RollingWindow.new(k_period);
        local lo: RollingWindow = RollingWindow.new(k_period);
        local first: int = -1;
        loop (local i: int = 0; i < n; i = i + 1) {
            hi.push(s.high[i]);
            lo.push(s.low[i]);
            if (hi.full()) {
                local range: float = hi.max() - lo.min();
                r.k[i] = range > 0.0 ? (100.0 * (s.close[i] - lo.min())) / range : 50.0;
                if (first < 0) {
                    first = i;
                }
            }
        }
        if (first >= 0) {
            Indicators.sma(r.k + first, n - first, d_period, r.d + first);
        }
        hi.destroy();
        lo.destroy();
        return r;
    }

    frame williamsR(s: *BarSeries, period: int, out: *float) {
        local hi: RollingWindow = RollingWindow.new(period);
        local lo: RollingWindow = RollingWindow.new(period);
        loop (local i: int = 0; i < s.len; i = i + 1) {
            hi.push(s.high[i]);
            lo.push(s.low[i]);
            if (hi.full()) {
                local range: float = hi.max() - lo.min();
                out[i] = range > 0.0 ? (-100.0 * (hi.max() - s.close[i])) / range : -50.0;
            } else {
                out[i] = Indicators.nan();
            }
        }
        hi.destroy();
        lo.destroy();
    }

    # Commodity channel index.
    frame cci(s: *BarSeries, period: int, out: *float) {
        local n: int = s.len;
        local tp: *float = Indicators.alloc(n);
        loop (local i: int = 0; i < n; i = i + 1) {
            tp[i] = s.typicalPrice(i);
        }
        loop (local i: int = 0; i < n; i = i + 1) {
            if (i < (period - 1)) {
                out[i] = Indicators.nan();
                continue;
            }
            local mean: float = 0.0;
            loop (local k: int = (i - period) + 1; k <= i; k = k + 1) {
                mean = mean + tp[k];
            }
            mean = mean / cast<float>(period);
            local dev: float = 0.0;
            loop (local k: int = (i - period) + 1; k <= i; k = k + 1) {
                dev = dev + Math.abs(tp[k] - mean);
            }
            dev = dev / cast<float>(period);
            out[i] = dev > 0.0 ? (tp[i] - mean) / (0.015 * dev) : 0.0;
        }
        free(cast<*void>(tp));
    }

    # Average directional index (Wilder).
    frame adx(s: *BarSeries, period: int) ret AdxOut {
        local n: int = s.len;
        local r: AdxOut;
        r.n = n;
        r.adx = Indicators.alloc(n);
        r.plus_di = Indicators.alloc(n);
        r.minus_di = Indicators.alloc(n);
        local plus_dm: *float = Indicators.alloc(n);
        local minus_dm: *float = Indicators.alloc(n);
        local tr: *float = Indicators.alloc(n);
        plus_dm[0] = 0.0;
        minus_dm[0] = 0.0;
        tr[0] = s.high[0] - s.low[0];
        loop (local i: int = 1; i < n; i = i + 1) {
            local up: float = s.high[i] - s.high[i - 1];
            local down: float = s.low[i - 1] - s.low[i];
            plus_dm[i] = (up > down) && (up > 0.0) ? up : 0.0;
            minus_dm[i] = (down > up) && (down > 0.0) ? down : 0.0;
            tr[i] = s.trueRange(i);
        }
        local spdm: *float = Indicators.alloc(n);
        local smdm: *float = Indicators.alloc(n);
        local str: *float = Indicators.alloc(n);
        Indicators.rma(plus_dm, n, period, spdm);
        Indicators.rma(minus_dm, n, period, smdm);
        Indicators.rma(tr, n, period, str);
        local dx: *float = Indicators.alloc(n);
        loop (local i: int = 0; i < n; i = i + 1) {
            if (Indicators.isNan(str[i]) || (str[i] == 0.0)) {
                continue;
            }
            r.plus_di[i] = (100.0 * spdm[i]) / str[i];
            r.minus_di[i] = (100.0 * smdm[i]) / str[i];
            local sum: float = r.plus_di[i] + r.minus_di[i];
            dx[i] = sum > 0.0 ? (100.0 * Math.abs(r.plus_di[i] - r.minus_di[i])) / sum : 0.0;
        }
        Indicators.rma(dx, n, period, r.adx);
        free(cast<*void>(plus_dm));
        free(cast<*void>(minus_dm));
        free(cast<*void>(tr));
        free(cast<*void>(spdm));
        free(cast<*void>(smdm));
        free(cast<*void>(str));
        free(cast<*void>(dx));
        return r;
    }

    # On-balance volume.
    frame obv(s: *BarSeries, out: *float) {
        local v: float = 0.0;
        loop (local i: int = 0; i < s.len; i = i + 1) {
            if (i > 0) {
                if (s.close[i] > s.close[i - 1]) {
                    v = v + s.volume[i];
                } else if (s.close[i] < s.close[i - 1]) {
                    v = v - s.volume[i];
                }
            }
            out[i] = v;
        }
    }

    # Money flow index.
    frame mfi(s: *BarSeries, period: int, out: *float) {
        local n: int = s.len;
        local pos: RollingWindow = RollingWindow.new(period);
        local neg: RollingWindow = RollingWindow.new(period);
        out[0] = Indicators.nan();
        loop (local i: int = 1; i < n; i = i + 1) {
            local tp: float = s.typicalPrice(i);
            local prev: float = s.typicalPrice(i - 1);
            local flow: float = tp * s.volume[i];
            pos.push(tp > prev ? flow : 0.0);
            neg.push(tp < prev ? flow : 0.0);
            if (pos.full()) {
                local p: float = pos.sum;
                local q: float = neg.sum;
                out[i] = q <= 0.0 ? 100.0 : 100.0 - (100.0 / (1.0 + (p / q)));
            } else {
                out[i] = Indicators.nan();
            }
        }
        pos.destroy();
        neg.destroy();
    }

    # Cumulative VWAP from bar typical prices, resetting every `session` bars (0 = never).
    frame vwap(s: *BarSeries, session: int, out: *float) {
        local pv: float = 0.0;
        local vol: float = 0.0;
        loop (local i: int = 0; i < s.len; i = i + 1) {
            if ((session > 0) && ((i % session) == 0)) {
                pv = 0.0;
                vol = 0.0;
            }
            pv = pv + (s.typicalPrice(i) * s.volume[i]);
            vol = vol + s.volume[i];
            out[i] = vol > 0.0 ? pv / vol : s.close[i];
        }
    }

    # Rolling VWAP over a fixed number of bars.
    frame rollingVwap(s: *BarSeries, period: int, out: *float) {
        local pv: RollingWindow = RollingWindow.new(period);
        local v: RollingWindow = RollingWindow.new(period);
        loop (local i: int = 0; i < s.len; i = i + 1) {
            pv.push(s.vwap[i] * s.volume[i]);
            v.push(s.volume[i]);
            out[i] = pv.full() && (v.sum > 0.0) ? pv.sum / v.sum : Indicators.nan();
        }
        pv.destroy();
        v.destroy();
    }

    frame roc(x: *float, n: int, period: int, out: *float) {
        loop (local i: int = 0; i < n; i = i + 1) {
            out[i] = (i >= period) && (x[i - period] != 0.0) ? (100.0 * (x[i] - x[i - period])) / x[i - period] : Indicators.nan();
        }
    }

    frame momentum(x: *float, n: int, period: int, out: *float) {
        loop (local i: int = 0; i < n; i = i + 1) {
            out[i] = i >= period ? x[i] - x[i - period] : Indicators.nan();
        }
    }

    # TRIX: one-period rate of change of a triple-smoothed EMA.
    frame trix(x: *float, n: int, period: int, out: *float) {
        local e1: *float = Indicators.alloc(n);
        local e2: *float = Indicators.alloc(n);
        local e3: *float = Indicators.alloc(n);
        Indicators.ema(x, n, period, e1);
        Indicators.ema(e1, n, period, e2);
        Indicators.ema(e2, n, period, e3);
        out[0] = Indicators.nan();
        loop (local i: int = 1; i < n; i = i + 1) {
            out[i] = e3[i - 1] != 0.0 ? (100.0 * (e3[i] - e3[i - 1])) / e3[i - 1] : Indicators.nan();
        }
        free(cast<*void>(e1));
        free(cast<*void>(e2));
        free(cast<*void>(e3));
    }

    # Aroon oscillator (up - down).
    frame aroon(s: *BarSeries, period: int, up: *float, down: *float) {
        local hi: RollingWindow = RollingWindow.new(period + 1);
        local lo: RollingWindow = RollingWindow.new(period + 1);
        loop (local i: int = 0; i < s.len; i = i + 1) {
            hi.push(s.high[i]);
            lo.push(s.low[i]);
            if (hi.full()) {
                up[i] = (100.0 * cast<float>(period - hi.argmaxAge())) / cast<float>(period);
                down[i] = (100.0 * cast<float>(period - lo.argminAge())) / cast<float>(period);
            } else {
                up[i] = Indicators.nan();
                down[i] = Indicators.nan();
            }
        }
        hi.destroy();
        lo.destroy();
    }

    # Chaikin accumulation/distribution line and oscillator (3/10 EMA).
    frame chaikin(s: *BarSeries, ad: *float, osc: *float) {
        local acc: float = 0.0;
        loop (local i: int = 0; i < s.len; i = i + 1) {
            local range: float = s.high[i] - s.low[i];
            local mfm: float = range > 0.0 ? ((s.close[i] - s.low[i]) - (s.high[i] - s.close[i])) / range : 0.0;
            acc = acc + (mfm * s.volume[i]);
            ad[i] = acc;
        }
        local e3: *float = Indicators.alloc(s.len);
        local e10: *float = Indicators.alloc(s.len);
        Indicators.ema(ad, s.len, 3, e3);
        Indicators.ema(ad, s.len, 10, e10);
        loop (local i: int = 0; i < s.len; i = i + 1) {
            osc[i] = e3[i] - e10[i];
        }
        free(cast<*void>(e3));
        free(cast<*void>(e10));
    }

    # Parabolic SAR with the classic 0.02 step and 0.2 cap.
    frame parabolicSar(s: *BarSeries, step: float, max_step: float, out: *float) {
        local n: int = s.len;
        if (n < 2) {
            if (n == 1) {
                out[0] = Indicators.nan();
            }
            return;
        }
        local up: bool = s.close[1] >= s.close[0];
        local sar: float = up ? s.low[0] : s.high[0];
        local ep: float = up ? s.high[0] : s.low[0];
        local af: float = step;
        out[0] = Indicators.nan();
        loop (local i: int = 1; i < n; i = i + 1) {
            sar = sar + (af * (ep - sar));
            if (up) {
                sar = Math.min(sar, s.low[i - 1]);
                if (i > 1) {
                    sar = Math.min(sar, s.low[i - 2]);
                }
                if (s.low[i] < sar) {
                    up = false;
                    sar = ep;
                    ep = s.low[i];
                    af = step;
                } else if (s.high[i] > ep) {
                    ep = s.high[i];
                    af = Math.min(af + step, max_step);
                }
            } else {
                sar = Math.max(sar, s.high[i - 1]);
                if (i > 1) {
                    sar = Math.max(sar, s.high[i - 2]);
                }
                if (s.high[i] > sar) {
                    up = true;
                    sar = ep;
                    ep = s.high[i];
                    af = step;
                } else if (s.low[i] < ep) {
                    ep = s.low[i];
                    af = Math.min(af + step, max_step);
                }
            }
            out[i] = sar;
        }
    }

    frame ichimoku(s: *BarSeries, tenkan_p: int, kijun_p: int, span_p: int) ret IchimokuOut {
        local n: int = s.len;
        local r: IchimokuOut;
        r.n = n;
        r.tenkan = Indicators.alloc(n);
        r.kijun = Indicators.alloc(n);
        r.span_a = Indicators.alloc(n);
        r.span_b = Indicators.alloc(n);
        local th: RollingWindow = RollingWindow.new(tenkan_p);
        local tl: RollingWindow = RollingWindow.new(tenkan_p);
        local kh: RollingWindow = RollingWindow.new(kijun_p);
        local kl: RollingWindow = RollingWindow.new(kijun_p);
        local sh: RollingWindow = RollingWindow.new(span_p);
        local sl: RollingWindow = RollingWindow.new(span_p);
        loop (local i: int = 0; i < n; i = i + 1) {
            th.push(s.high[i]);
            tl.push(s.low[i]);
            kh.push(s.high[i]);
            kl.push(s.low[i]);
            sh.push(s.high[i]);
            sl.push(s.low[i]);
            if (th.full()) {
                r.tenkan[i] = 0.5 * (th.max() + tl.min());
            }
            if (kh.full()) {
                r.kijun[i] = 0.5 * (kh.max() + kl.min());
            }
            # Spans are plotted kijun_p bars ahead; store them at their target bar.
            local target: int = i + kijun_p;
            if (target < n) {
                if (th.full() && kh.full()) {
                    r.span_a[target] = 0.5 * (r.tenkan[i] + r.kijun[i]);
                }
                if (sh.full()) {
                    r.span_b[target] = 0.5 * (sh.max() + sl.min());
                }
            }
        }
        th.destroy();
        tl.destroy();
        kh.destroy();
        kl.destroy();
        sh.destroy();
        sl.destroy();
        return r;
    }

    # Rolling z-score of x over `period`.
    frame zscore(x: *float, n: int, period: int, out: *float) {
        local w: RollingWindow = RollingWindow.new(period);
        loop (local i: int = 0; i < n; i = i + 1) {
            w.push(x[i]);
            local sd: float = w.stddev();
            out[i] = w.full() && (sd > 0.0) ? (x[i] - w.mean()) / sd : Indicators.nan();
        }
        w.destroy();
    }

    # Annualized close-to-close realized volatility.
    frame realizedVol(x: *float, n: int, period: int, periods_per_year: float, out: *float) {
        local w: RollingWindow = RollingWindow.new(period);
        out[0] = Indicators.nan();
        loop (local i: int = 1; i < n; i = i + 1) {
            w.push(Math.log(x[i] / x[i - 1]));
            out[i] = w.full() ? w.stddev() * Math.sqrt(periods_per_year) : Indicators.nan();
        }
        w.destroy();
    }

    # Parkinson high-low volatility estimator.
    frame parkinsonVol(s: *BarSeries, period: int, periods_per_year: float, out: *float) {
        local w: RollingWindow = RollingWindow.new(period);
        local k: float = 1.0 / (4.0 * Math.log(2.0));
        loop (local i: int = 0; i < s.len; i = i + 1) {
            local hl: float = Math.log(s.high[i] / s.low[i]);
            w.push(hl * hl);
            out[i] = w.full() ? Math.sqrt(k * w.mean() * periods_per_year) : Indicators.nan();
        }
        w.destroy();
    }

    # Garman-Klass volatility estimator.
    frame garmanKlassVol(s: *BarSeries, period: int, periods_per_year: float, out: *float) {
        local w: RollingWindow = RollingWindow.new(period);
        local c: float = (2.0 * Math.log(2.0)) - 1.0;
        loop (local i: int = 0; i < s.len; i = i + 1) {
            local hl: float = Math.log(s.high[i] / s.low[i]);
            local co: float = Math.log(s.close[i] / s.open[i]);
            w.push((0.5 * hl * hl) - (c * co * co));
            local m: float = w.mean();
            out[i] = w.full() && (m > 0.0) ? Math.sqrt(m * periods_per_year) : Indicators.nan();
        }
        w.destroy();
    }

    # Count of warm-up NaNs: first index holding a number, or n.
    frame firstValid(x: *float, n: int) ret int {
        loop (local i: int = 0; i < n; i = i + 1) {
            if (!Indicators.isNan(x[i])) {
                return i;
            }
        }
        return n;
    }

    frame lastValid(x: *float, n: int) ret float {
        local i: int = n - 1;
        loop (i >= 0) {
            if (!Indicators.isNan(x[i])) {
                return x[i];
            }
            i = i - 1;
        }
        return Indicators.nan();
    }

    # Crossovers: +1 when a crosses above b, -1 when below, else 0.
    frame crossings(a: *float, b: *float, n: int, out: *int) ret int {
        local count: int = 0;
        out[0] = 0;
        loop (local i: int = 1; i < n; i = i + 1) {
            out[i] = 0;
            if (Indicators.isNan(a[i - 1]) || Indicators.isNan(b[i - 1]) || Indicators.isNan(a[i]) || Indicators.isNan(b[i])) {
                continue;
            }
            if ((a[i - 1] <= b[i - 1]) && (a[i] > b[i])) {
                out[i] = 1;
                count = count + 1;
            } else if ((a[i - 1] >= b[i - 1]) && (a[i] < b[i])) {
                out[i] = -1;
                count = count + 1;
            }
        }
        return count;
    }
}
