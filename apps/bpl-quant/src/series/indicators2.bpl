# More technical indicators (trend, momentum, volatility and volume).
#
# Same conventions as Indicators: one output per bar, NaN during warm-up.
# Single-output indicators are dispatched by name through
# MoreIndicators.compute() so the API can list and serve them uniformly.

import [Math] from "std/math.bpl";
import free from "std/c.bpl";
import [Text] from "../core/text.bpl";
import [BarSeries] from "./bars.bpl";
import [Indicators] from "./indicators.bpl";

export [MoreIndicators];
export [SuperTrendOut];
export [HeikinAshi];
export [Pivots];

struct SuperTrendOut {
    line: *float,
    direction: *float,
    n: int,

    frame destroy(this: *SuperTrendOut) {
        free(cast<*void>(this.line));
        free(cast<*void>(this.direction));
    }
}

struct HeikinAshi {
    open: *float,
    high: *float,
    low: *float,
    close: *float,
    n: int,

    frame destroy(this: *HeikinAshi) {
        free(cast<*void>(this.open));
        free(cast<*void>(this.high));
        free(cast<*void>(this.low));
        free(cast<*void>(this.close));
    }
}

# Classic floor-trader pivots from one bar.
struct Pivots {
    pivot: float,
    r1: float,
    r2: float,
    r3: float,
    s1: float,
    s2: float,
    s3: float,
}

global more_indicator_names: string[24] = ["zlema", "alma", "t3", "vwma", "mcginley", "cmo", "tsi", "ppo", "dpo", "coppock", "kst", "ultimate", "awesome", "fisher", "connors_rsi", "vortex", "choppiness", "mass_index", "ulcer", "elder_bull", "force_index", "ease_of_movement", "linreg_slope", "linreg_r2"];

struct MoreIndicators {
    frame count() ret int {
        return 24;
    }

    frame name(i: int) ret string {
        return more_indicator_names[i];
    }

    frame nan() ret float {
        return Indicators.nan();
    }

    frame bad(x: float) ret bool {
        return x != x;
    }

    # Zero-lag EMA: EMA of 2 x - x[t - lag], lag = (period - 1) / 2.
    frame zlema(x: *float, n: int, period: int, out: *float) {
        local lag: int = (period - 1) / 2;
        local adj: *float = Indicators.alloc(n);
        loop (local i: int = lag; i < n; i = i + 1) {
            adj[i] = (2.0 * x[i]) - x[i - lag];
        }
        Indicators.ema(adj, n, period, out);
        free(cast<*void>(adj));
    }

    # Arnaud Legoux moving average (offset 0.85, sigma 6).
    frame alma(x: *float, n: int, period: int, out: *float) {
        local m: float = 0.85 * cast<float>(period - 1);
        local s: float = cast<float>(period) / 6.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            if (i < (period - 1)) {
                out[i] = MoreIndicators.nan();
                continue;
            }
            local num: float = 0.0;
            local den: float = 0.0;
            loop (local k: int = 0; k < period; k = k + 1) {
                local d: float = cast<float>(k) - m;
                local wk: float = Math.exp(-(d * d) / (2.0 * s * s));
                num = num + (wk * x[(i - period) + 1 + k]);
                den = den + wk;
            }
            out[i] = num / den;
        }
    }

    # Tillson T3 with volume factor 0.7 (six chained EMAs).
    frame t3(x: *float, n: int, period: int, out: *float) {
        local a: float = 0.7;
        local e: *float[6];
        local src: *float = x;
        loop (local k: int = 0; k < 6; k = k + 1) {
            e[k] = Indicators.alloc(n);
            Indicators.ema(src, n, period, e[k]);
            src = e[k];
        }
        local c1: float = -(a * a * a);
        local c2: float = (3.0 * a * a) + (3.0 * a * a * a);
        local c3: float = (-6.0 * a * a) - (3.0 * a) - (3.0 * a * a * a);
        local c4: float = 1.0 + (3.0 * a) + (a * a * a) + (3.0 * a * a);
        loop (local i: int = 0; i < n; i = i + 1) {
            out[i] = (c1 * e[5][i]) + (c2 * e[4][i]) + (c3 * e[3][i]) + (c4 * e[2][i]);
        }
        loop (local k: int = 0; k < 6; k = k + 1) {
            free(cast<*void>(e[k]));
        }
    }

    frame vwma(s: *BarSeries, period: int, out: *float) {
        local pv: float = 0.0;
        local v: float = 0.0;
        loop (local i: int = 0; i < s.len; i = i + 1) {
            pv = pv + (s.close[i] * s.volume[i]);
            v = v + s.volume[i];
            if (i >= period) {
                pv = pv - (s.close[i - period] * s.volume[i - period]);
                v = v - s.volume[i - period];
            }
            out[i] = (i >= (period - 1)) && (v > 0.0) ? pv / v : MoreIndicators.nan();
        }
    }

    # McGinley dynamic: md += (x - md) / (k * period * (x / md)^4), k = 0.6.
    frame mcginley(x: *float, n: int, period: int, out: *float) {
        if (n == 0) {
            return;
        }
        local md: float = x[0];
        out[0] = md;
        loop (local i: int = 1; i < n; i = i + 1) {
            local ratio: float = x[i] / md;
            md = md + ((x[i] - md) / (0.6 * cast<float>(period) * Math.pow(ratio, 4.0)));
            out[i] = md;
        }
    }

    # Chande momentum oscillator: 100 (up - down) / (up + down).
    frame cmo(x: *float, n: int, period: int, out: *float) {
        loop (local i: int = 0; i < n; i = i + 1) {
            if (i < period) {
                out[i] = MoreIndicators.nan();
                continue;
            }
            local up: float = 0.0;
            local down: float = 0.0;
            loop (local k: int = (i - period) + 1; k <= i; k = k + 1) {
                local d: float = x[k] - x[k - 1];
                if (d > 0.0) {
                    up = up + d;
                } else {
                    down = down - d;
                }
            }
            out[i] = (up + down) > 0.0 ? (100.0 * (up - down)) / (up + down) : 0.0;
        }
    }

    # EMA that skips leading NaNs (for chained smoothing).
    frame emaSkip(x: *float, n: int, period: int, out: *float) {
        local first: int = 0;
        loop ((first < n) && MoreIndicators.bad(x[first])) {
            out[first] = MoreIndicators.nan();
            first = first + 1;
        }
        if (first < n) {
            Indicators.ema(x + first, n - first, period, out + first);
        }
    }

    # True strength index: double-smoothed momentum over double-smoothed
    # absolute momentum (25, 13).
    frame tsi(x: *float, n: int, out: *float) {
        local m: *float = Indicators.alloc(n);
        local a: *float = Indicators.alloc(n);
        loop (local i: int = 1; i < n; i = i + 1) {
            m[i] = x[i] - x[i - 1];
            a[i] = Math.abs(m[i]);
        }
        local m1: *float = Indicators.alloc(n);
        local m2: *float = Indicators.alloc(n);
        local a1: *float = Indicators.alloc(n);
        local a2: *float = Indicators.alloc(n);
        MoreIndicators.emaSkip(m, n, 25, m1);
        MoreIndicators.emaSkip(m1, n, 13, m2);
        MoreIndicators.emaSkip(a, n, 25, a1);
        MoreIndicators.emaSkip(a1, n, 13, a2);
        loop (local i: int = 0; i < n; i = i + 1) {
            out[i] = (!MoreIndicators.bad(a2[i]) && (a2[i] > 0.0)) ? (100.0 * m2[i]) / a2[i] : MoreIndicators.nan();
        }
        free(cast<*void>(m));
        free(cast<*void>(a));
        free(cast<*void>(m1));
        free(cast<*void>(m2));
        free(cast<*void>(a1));
        free(cast<*void>(a2));
    }

    # Percentage price oscillator: 100 (EMA12 - EMA26) / EMA26.
    frame ppo(x: *float, n: int, out: *float) {
        local fast: *float = Indicators.alloc(n);
        local slow: *float = Indicators.alloc(n);
        Indicators.ema(x, n, 12, fast);
        Indicators.ema(x, n, 26, slow);
        loop (local i: int = 0; i < n; i = i + 1) {
            out[i] = MoreIndicators.bad(slow[i]) ? MoreIndicators.nan() : (100.0 * (fast[i] - slow[i])) / slow[i];
        }
        free(cast<*void>(fast));
        free(cast<*void>(slow));
    }

    # Detrended price oscillator: x[t - (period/2 + 1)] - SMA(period)[t].
    frame dpo(x: *float, n: int, period: int, out: *float) {
        local ma: *float = Indicators.alloc(n);
        Indicators.sma(x, n, period, ma);
        local shift: int = (period / 2) + 1;
        loop (local i: int = 0; i < n; i = i + 1) {
            out[i] = (i >= shift) && !MoreIndicators.bad(ma[i]) ? x[i - shift] - ma[i] : MoreIndicators.nan();
        }
        free(cast<*void>(ma));
    }

    frame rocAt(x: *float, i: int, period: int) ret float {
        if (i < period) {
            return MoreIndicators.nan();
        }
        return (100.0 * (x[i] - x[i - period])) / x[i - period];
    }

    # Coppock curve: WMA(10) of ROC(14) + ROC(11), with monthly periods
    # applied to the bar interval.
    frame coppock(x: *float, n: int, out: *float) {
        local sum: *float = Indicators.alloc(n);
        loop (local i: int = 14; i < n; i = i + 1) {
            sum[i] = MoreIndicators.rocAt(x, i, 14) + MoreIndicators.rocAt(x, i, 11);
        }
        local first: int = 14 < n ? 14 : n;
        loop (local i: int = 0; i < n; i = i + 1) {
            out[i] = MoreIndicators.nan();
        }
        if (first < n) {
            Indicators.wma(sum + first, n - first, 10, out + first);
        }
        free(cast<*void>(sum));
    }

    # Know Sure Thing: weighted sum of smoothed ROCs (10/15/20/30).
    frame kst(x: *float, n: int, out: *float) {
        local rp: int[4] = [10, 15, 20, 30];
        local sp: int[4] = [10, 10, 10, 15];
        local acc: *float = Indicators.alloc(n);
        loop (local i: int = 0; i < n; i = i + 1) {
            acc[i] = 0.0;
        }
        local roc: *float = Indicators.alloc(n);
        local smooth: *float = Indicators.alloc(n);
        loop (local k: int = 0; k < 4; k = k + 1) {
            loop (local i: int = 0; i < n; i = i + 1) {
                roc[i] = MoreIndicators.rocAt(x, i, rp[k]);
            }
            loop (local i: int = 0; i < n; i = i + 1) {
                smooth[i] = MoreIndicators.nan();
            }
            if (rp[k] < n) {
                Indicators.sma(roc + rp[k], n - rp[k], sp[k], smooth + rp[k]);
            }
            loop (local i: int = 0; i < n; i = i + 1) {
                acc[i] = acc[i] + (cast<float>(k + 1) * smooth[i]);
            }
        }
        loop (local i: int = 0; i < n; i = i + 1) {
            out[i] = acc[i];
        }
        free(cast<*void>(acc));
        free(cast<*void>(roc));
        free(cast<*void>(smooth));
    }

    # Ultimate oscillator (7, 14, 28).
    frame ultimate(s: *BarSeries, out: *float) {
        local n: int = s.len;
        loop (local i: int = 0; i < n; i = i + 1) {
            if (i < 28) {
                out[i] = MoreIndicators.nan();
                continue;
            }
            local avg: float[3];
            local periods: int[3] = [7, 14, 28];
            loop (local k: int = 0; k < 3; k = k + 1) {
                local bp: float = 0.0;
                local tr: float = 0.0;
                loop (local j: int = (i - periods[k]) + 1; j <= i; j = j + 1) {
                    local prev: float = s.close[j - 1];
                    local lo: float = Math.min(s.low[j], prev);
                    local hi: float = Math.max(s.high[j], prev);
                    bp = bp + (s.close[j] - lo);
                    tr = tr + (hi - lo);
                }
                avg[k] = tr > 0.0 ? bp / tr : 0.0;
            }
            out[i] = (100.0 * ((4.0 * avg[0]) + (2.0 * avg[1]) + avg[2])) / 7.0;
        }
    }

    # Awesome oscillator: SMA5 - SMA34 of the median price.
    frame awesome(s: *BarSeries, out: *float) {
        local n: int = s.len;
        local mid: *float = Indicators.alloc(n);
        loop (local i: int = 0; i < n; i = i + 1) {
            mid[i] = 0.5 * (s.high[i] + s.low[i]);
        }
        local fast: *float = Indicators.alloc(n);
        local slow: *float = Indicators.alloc(n);
        Indicators.sma(mid, n, 5, fast);
        Indicators.sma(mid, n, 34, slow);
        loop (local i: int = 0; i < n; i = i + 1) {
            out[i] = fast[i] - slow[i];
        }
        free(cast<*void>(mid));
        free(cast<*void>(fast));
        free(cast<*void>(slow));
    }

    # Ehlers Fisher transform of the median price over `period` bars.
    frame fisher(s: *BarSeries, period: int, out: *float) {
        local value: float = 0.0;
        local fish: float = 0.0;
        loop (local i: int = 0; i < s.len; i = i + 1) {
            if (i < (period - 1)) {
                out[i] = MoreIndicators.nan();
                continue;
            }
            local hi: float = -1000000000000000000000000000000.0;
            local lo: float = 1000000000000000000000000000000.0;
            loop (local k: int = (i - period) + 1; k <= i; k = k + 1) {
                local m: float = 0.5 * (s.high[k] + s.low[k]);
                hi = Math.max(hi, m);
                lo = Math.min(lo, m);
            }
            local mid: float = 0.5 * (s.high[i] + s.low[i]);
            local raw: float = hi > lo ? ((mid - lo) / (hi - lo)) - 0.5 : 0.0;
            value = (0.66 * raw) + (0.67 * value);
            value = Math.max(-0.999, Math.min(0.999, value));
            fish = (0.5 * Math.log((1.0 + value) / (1.0 - value))) + (0.5 * fish);
            out[i] = fish;
        }
    }

    # Connors RSI: mean of RSI(3), RSI(2) of the up/down streak, and the
    # percent rank of the one-bar return over 100 bars.
    frame connorsRsi(x: *float, n: int, out: *float) {
        local r3: *float = Indicators.alloc(n);
        Indicators.rsi(x, n, 3, r3);
        local streak: *float = Indicators.alloc(n);
        local run: float = 0.0;
        streak[0] = 0.0;
        loop (local i: int = 1; i < n; i = i + 1) {
            if (x[i] > x[i - 1]) {
                run = run > 0.0 ? run + 1.0 : 1.0;
            } else if (x[i] < x[i - 1]) {
                run = run < 0.0 ? run - 1.0 : -1.0;
            } else {
                run = 0.0;
            }
            streak[i] = run;
        }
        local rs: *float = Indicators.alloc(n);
        Indicators.rsi(streak, n, 2, rs);
        loop (local i: int = 0; i < n; i = i + 1) {
            if ((i < 101) || MoreIndicators.bad(r3[i]) || MoreIndicators.bad(rs[i])) {
                out[i] = MoreIndicators.nan();
                continue;
            }
            local ret_now: float = (x[i] / x[i - 1]) - 1.0;
            local below: float = 0.0;
            loop (local k: int = i - 100; k < i; k = k + 1) {
                if (((x[k] / x[k - 1]) - 1.0) < ret_now) {
                    below = below + 1.0;
                }
            }
            out[i] = (r3[i] + rs[i] + below) / 3.0;
        }
        free(cast<*void>(r3));
        free(cast<*void>(streak));
        free(cast<*void>(rs));
    }

    # Vortex indicator: VI+ minus VI- over `period` bars.
    frame vortex(s: *BarSeries, period: int, out: *float) {
        loop (local i: int = 0; i < s.len; i = i + 1) {
            if (i < period) {
                out[i] = MoreIndicators.nan();
                continue;
            }
            local vp: float = 0.0;
            local vm: float = 0.0;
            local tr: float = 0.0;
            loop (local k: int = (i - period) + 1; k <= i; k = k + 1) {
                vp = vp + Math.abs(s.high[k] - s.low[k - 1]);
                vm = vm + Math.abs(s.low[k] - s.high[k - 1]);
                tr = tr + (Math.max(s.high[k], s.close[k - 1]) - Math.min(s.low[k], s.close[k - 1]));
            }
            out[i] = tr > 0.0 ? (vp - vm) / tr : 0.0;
        }
    }

    # Choppiness index: 100 log10(sum TR / (max high - min low)) / log10(period).
    frame choppiness(s: *BarSeries, period: int, out: *float) {
        loop (local i: int = 0; i < s.len; i = i + 1) {
            if (i < period) {
                out[i] = MoreIndicators.nan();
                continue;
            }
            local tr: float = 0.0;
            local hi: float = -1000000000000000000000000000000.0;
            local lo: float = 1000000000000000000000000000000.0;
            loop (local k: int = (i - period) + 1; k <= i; k = k + 1) {
                tr = tr + (Math.max(s.high[k], s.close[k - 1]) - Math.min(s.low[k], s.close[k - 1]));
                hi = Math.max(hi, s.high[k]);
                lo = Math.min(lo, s.low[k]);
            }
            out[i] = hi > lo ? (100.0 * Math.log10(tr / (hi - lo))) / Math.log10(cast<float>(period)) : MoreIndicators.nan();
        }
    }

    # Mass index: 25-bar sum of EMA9(range) / EMA9(EMA9(range)).
    frame massIndex(s: *BarSeries, out: *float) {
        local n: int = s.len;
        local range: *float = Indicators.alloc(n);
        loop (local i: int = 0; i < n; i = i + 1) {
            range[i] = s.high[i] - s.low[i];
        }
        local e1: *float = Indicators.alloc(n);
        local e2: *float = Indicators.alloc(n);
        Indicators.ema(range, n, 9, e1);
        MoreIndicators.emaSkip(e1, n, 9, e2);
        local ratio: *float = Indicators.alloc(n);
        loop (local i: int = 0; i < n; i = i + 1) {
            ratio[i] = (MoreIndicators.bad(e2[i]) || (e2[i] == 0.0)) ? MoreIndicators.nan() : e1[i] / e2[i];
        }
        loop (local i: int = 0; i < n; i = i + 1) {
            local sum: float = 0.0;
            local ok: bool = i >= 24;
            loop (local k: int = i - 24; ok && (k <= i); k = k + 1) {
                if (MoreIndicators.bad(ratio[k])) {
                    ok = false;
                } else {
                    sum = sum + ratio[k];
                }
            }
            out[i] = ok ? sum : MoreIndicators.nan();
        }
        free(cast<*void>(range));
        free(cast<*void>(e1));
        free(cast<*void>(e2));
        free(cast<*void>(ratio));
    }

    # Ulcer index: RMS of the percent drawdown from the rolling max.
    frame ulcer(x: *float, n: int, period: int, out: *float) {
        loop (local i: int = 0; i < n; i = i + 1) {
            if (i < (period - 1)) {
                out[i] = MoreIndicators.nan();
                continue;
            }
            local peak: float = x[(i - period) + 1];
            local sq: float = 0.0;
            loop (local k: int = (i - period) + 1; k <= i; k = k + 1) {
                peak = Math.max(peak, x[k]);
                local dd: float = (100.0 * (x[k] - peak)) / peak;
                sq = sq + (dd * dd);
            }
            out[i] = Math.sqrt(sq / cast<float>(period));
        }
    }

    # Elder bull power: high - EMA13(close).
    frame elderBull(s: *BarSeries, out: *float) {
        local e: *float = Indicators.alloc(s.len);
        Indicators.ema(s.close, s.len, 13, e);
        loop (local i: int = 0; i < s.len; i = i + 1) {
            out[i] = s.high[i] - e[i];
        }
        free(cast<*void>(e));
    }

    # Force index: EMA13 of (close change x volume).
    frame forceIndex(s: *BarSeries, out: *float) {
        local raw: *float = Indicators.alloc(s.len);
        loop (local i: int = 1; i < s.len; i = i + 1) {
            raw[i] = (s.close[i] - s.close[i - 1]) * s.volume[i];
        }
        MoreIndicators.emaSkip(raw, s.len, 13, out);
        free(cast<*void>(raw));
    }

    # Ease of movement (14-bar SMA), volume scaled by 1e6.
    frame easeOfMovement(s: *BarSeries, out: *float) {
        local raw: *float = Indicators.alloc(s.len);
        loop (local i: int = 1; i < s.len; i = i + 1) {
            local move: float = (0.5 * (s.high[i] + s.low[i])) - (0.5 * (s.high[i - 1] + s.low[i - 1]));
            local range: float = s.high[i] - s.low[i];
            local box: float = range > 0.0 ? (s.volume[i] / 1000000.0) / range : 0.0;
            raw[i] = box > 0.0 ? move / box : 0.0;
        }
        loop (local i: int = 0; i < s.len; i = i + 1) {
            out[i] = MoreIndicators.nan();
        }
        if (s.len > 1) {
            Indicators.sma(raw + 1, s.len - 1, 14, out + 1);
        }
        free(cast<*void>(raw));
    }

    # Rolling least-squares slope (per bar) and R-squared.
    frame linreg(x: *float, n: int, period: int, slope: *float, r2: *float) {
        local p: float = cast<float>(period);
        local sx: float = (p * (p - 1.0)) / 2.0;
        local sxx: float = ((p - 1.0) * p * ((2.0 * p) - 1.0)) / 6.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            if (i < (period - 1)) {
                slope[i] = MoreIndicators.nan();
                r2[i] = MoreIndicators.nan();
                continue;
            }
            local sy: float = 0.0;
            local sxy: float = 0.0;
            local syy: float = 0.0;
            loop (local k: int = 0; k < period; k = k + 1) {
                local y: float = x[(i - period) + 1 + k];
                sy = sy + y;
                sxy = sxy + (cast<float>(k) * y);
                syy = syy + (y * y);
            }
            local den: float = (p * sxx) - (sx * sx);
            local b: float = ((p * sxy) - (sx * sy)) / den;
            slope[i] = b;
            local vy: float = (p * syy) - (sy * sy);
            local cov: float = (p * sxy) - (sx * sy);
            r2[i] = vy > 0.0 ? (cov * cov) / (den * vy) : 1.0;
        }
    }

    frame superTrend(s: *BarSeries, period: int, mult: float) ret SuperTrendOut {
        local o: SuperTrendOut;
        o.n = s.len;
        o.line = Indicators.alloc(s.len);
        o.direction = Indicators.alloc(s.len);
        local atr: *float = Indicators.alloc(s.len);
        Indicators.atr(s, period, atr);
        local upper: float = 0.0;
        local lower: float = 0.0;
        local up: bool = true;
        local started: bool = false;
        loop (local i: int = 0; i < s.len; i = i + 1) {
            if (MoreIndicators.bad(atr[i])) {
                continue;
            }
            local mid: float = 0.5 * (s.high[i] + s.low[i]);
            local bu: float = mid + (mult * atr[i]);
            local bl: float = mid - (mult * atr[i]);
            if (!started) {
                upper = bu;
                lower = bl;
                up = s.close[i] >= mid;
                started = true;
            } else {
                upper = (bu < upper) || (s.close[i - 1] > upper) ? bu : upper;
                lower = (bl > lower) || (s.close[i - 1] < lower) ? bl : lower;
                if (up && (s.close[i] < lower)) {
                    up = false;
                } else if (!up && (s.close[i] > upper)) {
                    up = true;
                }
            }
            o.line[i] = up ? lower : upper;
            o.direction[i] = up ? 1.0 : -1.0;
        }
        free(cast<*void>(atr));
        return o;
    }

    frame heikinAshi(s: *BarSeries) ret HeikinAshi {
        local h: HeikinAshi;
        h.n = s.len;
        h.open = Indicators.alloc(s.len);
        h.high = Indicators.alloc(s.len);
        h.low = Indicators.alloc(s.len);
        h.close = Indicators.alloc(s.len);
        loop (local i: int = 0; i < s.len; i = i + 1) {
            h.close[i] = 0.25 * (s.open[i] + s.high[i] + s.low[i] + s.close[i]);
            h.open[i] = i == 0 ? 0.5 * (s.open[0] + s.close[0]) : 0.5 * (h.open[i - 1] + h.close[i - 1]);
            h.high[i] = Math.max(s.high[i], Math.max(h.open[i], h.close[i]));
            h.low[i] = Math.min(s.low[i], Math.min(h.open[i], h.close[i]));
        }
        return h;
    }

    frame pivots(high: float, low: float, close: float) ret Pivots {
        local p: float = (high + low + close) / 3.0;
        return Pivots { pivot: p, r1: (2.0 * p) - low, r2: p + (high - low), r3: high + (2.0 * (p - low)), s1: (2.0 * p) - high, s2: p - (high - low), s3: low - (2.0 * (high - p)) };
    }

    # Dispatch by name; returns false for unknown names.
    frame compute(name: string, s: *BarSeries, period: int, out: *float) ret bool {
        local x: *float = s.close;
        local n: int = s.len;
        if (Text.equals(name, "zlema")) {
            MoreIndicators.zlema(x, n, period, out);
        } else if (Text.equals(name, "alma")) {
            MoreIndicators.alma(x, n, period, out);
        } else if (Text.equals(name, "t3")) {
            MoreIndicators.t3(x, n, period, out);
        } else if (Text.equals(name, "vwma")) {
            MoreIndicators.vwma(s, period, out);
        } else if (Text.equals(name, "mcginley")) {
            MoreIndicators.mcginley(x, n, period, out);
        } else if (Text.equals(name, "cmo")) {
            MoreIndicators.cmo(x, n, period, out);
        } else if (Text.equals(name, "tsi")) {
            MoreIndicators.tsi(x, n, out);
        } else if (Text.equals(name, "ppo")) {
            MoreIndicators.ppo(x, n, out);
        } else if (Text.equals(name, "dpo")) {
            MoreIndicators.dpo(x, n, period, out);
        } else if (Text.equals(name, "coppock")) {
            MoreIndicators.coppock(x, n, out);
        } else if (Text.equals(name, "kst")) {
            MoreIndicators.kst(x, n, out);
        } else if (Text.equals(name, "ultimate")) {
            MoreIndicators.ultimate(s, out);
        } else if (Text.equals(name, "awesome")) {
            MoreIndicators.awesome(s, out);
        } else if (Text.equals(name, "fisher")) {
            MoreIndicators.fisher(s, period, out);
        } else if (Text.equals(name, "connors_rsi")) {
            MoreIndicators.connorsRsi(x, n, out);
        } else if (Text.equals(name, "vortex")) {
            MoreIndicators.vortex(s, period, out);
        } else if (Text.equals(name, "choppiness")) {
            MoreIndicators.choppiness(s, period, out);
        } else if (Text.equals(name, "mass_index")) {
            MoreIndicators.massIndex(s, out);
        } else if (Text.equals(name, "ulcer")) {
            MoreIndicators.ulcer(x, n, period, out);
        } else if (Text.equals(name, "elder_bull")) {
            MoreIndicators.elderBull(s, out);
        } else if (Text.equals(name, "force_index")) {
            MoreIndicators.forceIndex(s, out);
        } else if (Text.equals(name, "ease_of_movement")) {
            MoreIndicators.easeOfMovement(s, out);
        } else if (Text.equals(name, "linreg_slope") || Text.equals(name, "linreg_r2")) {
            local other: *float = Indicators.alloc(n);
            if (Text.equals(name, "linreg_slope")) {
                MoreIndicators.linreg(x, n, period, out, other);
            } else {
                MoreIndicators.linreg(x, n, period, other, out);
            }
            free(cast<*void>(other));
        } else {
            return false;
        }
        return true;
    }
}
