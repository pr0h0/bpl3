# Descriptive and inferential statistics on raw double buffers.

import [Math] from "std/math.bpl";
import malloc, free from "std/c.bpl";
import [Sort] from "./sort.bpl";
import [Special] from "./special.bpl";

export [Stats];
export [Moments];
export [Regression];
export [TTest];
export [Histogram];
export [Welford];

struct Moments {
    count: int,
    mean: float,
    variance: float,
    stddev: float,
    skewness: float,
    kurtosis: float,
    min: float,
    max: float,
}

struct Regression {
    slope: float,
    intercept: float,
    r2: float,
    stderr_slope: float,
    stderr_intercept: float,
    residual_stddev: float,
    count: int,
}

struct TTest {
    t: float,
    dof: float,
    p_value: float,
}

struct Histogram {
    lo: float,
    hi: float,
    bins: int,
    counts: *int,
    total: int,
    below: int,
    above: int,

    frame new(lo: float, hi: float, bins: int) ret Histogram {
        local h: Histogram;
        h.lo = lo;
        h.hi = hi;
        h.bins = bins < 1 ? 1 : bins;
        h.counts = cast<*int>(malloc(cast<long>(h.bins) * sizeof(int)));
        loop (local i: int = 0; i < h.bins; i = i + 1) {
            h.counts[i] = 0;
        }
        h.total = 0;
        h.below = 0;
        h.above = 0;
        return h;
    }

    frame add(this: *Histogram, x: float) {
        this.total = this.total + 1;
        if (x < this.lo) {
            this.below = this.below + 1;
            return;
        }
        if (x >= this.hi) {
            this.above = this.above + 1;
            return;
        }
        local b: int = cast<int>(((x - this.lo) / (this.hi - this.lo)) * cast<float>(this.bins));
        if (b >= this.bins) {
            b = this.bins - 1;
        }
        this.counts[b] = this.counts[b] + 1;
    }

    frame binCenter(this: *Histogram, b: int) ret float {
        local w: float = (this.hi - this.lo) / cast<float>(this.bins);
        return this.lo + (w * (cast<float>(b) + 0.5));
    }

    frame mode(this: *Histogram) ret int {
        local best: int = 0;
        loop (local i: int = 1; i < this.bins; i = i + 1) {
            if (this.counts[i] > this.counts[best]) {
                best = i;
            }
        }
        return best;
    }

    frame destroy(this: *Histogram) {
        if (this.counts != nullptr) {
            free(cast<*void>(this.counts));
            this.counts = nullptr;
        }
    }
}

# Streaming mean/variance (Welford) with min/max.
struct Welford {
    n: long,
    mean: float,
    m2: float,
    min: float,
    max: float,

    frame new() ret Welford {
        return Welford { n: 0, mean: 0.0, m2: 0.0, min: 0.0, max: 0.0 };
    }

    frame add(this: *Welford, x: float) {
        this.n = this.n + 1;
        if (this.n == 1) {
            this.min = x;
            this.max = x;
        } else {
            if (x < this.min) {
                this.min = x;
            }
            if (x > this.max) {
                this.max = x;
            }
        }
        local delta: float = x - this.mean;
        this.mean = this.mean + (delta / cast<float>(this.n));
        this.m2 = this.m2 + (delta * (x - this.mean));
    }

    frame variance(this: *Welford) ret float {
        if (this.n < 2) {
            return 0.0;
        }
        return this.m2 / cast<float>(this.n - 1);
    }

    frame stddev(this: *Welford) ret float {
        return Math.sqrt(this.variance());
    }

    frame merge(this: *Welford, other: *Welford) {
        if (other.n == 0) {
            return;
        }
        if (this.n == 0) {
            this.n = other.n;
            this.mean = other.mean;
            this.m2 = other.m2;
            this.min = other.min;
            this.max = other.max;
            return;
        }
        local n: long = this.n + other.n;
        local delta: float = other.mean - this.mean;
        local nf: float = cast<float>(n);
        this.m2 = this.m2 + other.m2 + ((delta * delta * cast<float>(this.n) * cast<float>(other.n)) / nf);
        this.mean = this.mean + ((delta * cast<float>(other.n)) / nf);
        this.n = n;
        if (other.min < this.min) {
            this.min = other.min;
        }
        if (other.max > this.max) {
            this.max = other.max;
        }
    }
}

struct Stats {
    frame sum(x: *float, n: int) ret float {
        local s: float = 0.0;
        local c: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            local y: float = x[i] - c;
            local t: float = s + y;
            c = (t - s) - y;
            s = t;
        }
        return s;
    }

    frame mean(x: *float, n: int) ret float {
        if (n == 0) {
            return 0.0;
        }
        return Stats.sum(x, n) / cast<float>(n);
    }

    # Sample variance (n - 1 denominator), two-pass.
    frame variance(x: *float, n: int) ret float {
        if (n < 2) {
            return 0.0;
        }
        local m: float = Stats.mean(x, n);
        local s: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            local d: float = x[i] - m;
            s = s + (d * d);
        }
        return s / cast<float>(n - 1);
    }

    frame stddev(x: *float, n: int) ret float {
        return Math.sqrt(Stats.variance(x, n));
    }

    frame populationVariance(x: *float, n: int) ret float {
        if (n < 1) {
            return 0.0;
        }
        local m: float = Stats.mean(x, n);
        local s: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            local d: float = x[i] - m;
            s = s + (d * d);
        }
        return s / cast<float>(n);
    }

    frame moments(x: *float, n: int) ret Moments {
        local r: Moments;
        r.count = n;
        r.mean = 0.0;
        r.variance = 0.0;
        r.stddev = 0.0;
        r.skewness = 0.0;
        r.kurtosis = 0.0;
        r.min = 0.0;
        r.max = 0.0;
        if (n == 0) {
            return r;
        }
        r.mean = Stats.mean(x, n);
        r.min = x[0];
        r.max = x[0];
        local m2: float = 0.0;
        local m3: float = 0.0;
        local m4: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            local d: float = x[i] - r.mean;
            local d2: float = d * d;
            m2 = m2 + d2;
            m3 = m3 + (d2 * d);
            m4 = m4 + (d2 * d2);
            if (x[i] < r.min) {
                r.min = x[i];
            }
            if (x[i] > r.max) {
                r.max = x[i];
            }
        }
        local nf: float = cast<float>(n);
        if (n > 1) {
            r.variance = m2 / (nf - 1.0);
            r.stddev = Math.sqrt(r.variance);
        }
        if (m2 > 0.0) {
            local pv: float = m2 / nf;
            r.skewness = (m3 / nf) / (pv * Math.sqrt(pv));
            r.kurtosis = ((m4 / nf) / (pv * pv)) - 3.0;
        }
        return r;
    }

    # Linear-interpolated quantile (type 7) of unsorted data; does not mutate x.
    frame quantile(x: *float, n: int, q: float) ret float {
        if (n == 0) {
            return 0.0;
        }
        local sorted: *float = Sort.copySorted(x, n);
        local v: float = Stats.quantileSorted(sorted, n, q);
        free(cast<*void>(sorted));
        return v;
    }

    frame quantileSorted(sorted: *float, n: int, q: float) ret float {
        if (n == 0) {
            return 0.0;
        }
        if (q <= 0.0) {
            return sorted[0];
        }
        if (q >= 1.0) {
            return sorted[n - 1];
        }
        local h: float = cast<float>(n - 1) * q;
        local lo: int = cast<int>(Math.floor(h));
        local frac: float = h - cast<float>(lo);
        if ((lo + 1) >= n) {
            return sorted[n - 1];
        }
        return sorted[lo] + (frac * (sorted[lo + 1] - sorted[lo]));
    }

    frame median(x: *float, n: int) ret float {
        return Stats.quantile(x, n, 0.5);
    }

    frame mad(x: *float, n: int) ret float {
        if (n == 0) {
            return 0.0;
        }
        local med: float = Stats.median(x, n);
        local dev: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        loop (local i: int = 0; i < n; i = i + 1) {
            dev[i] = Math.abs(x[i] - med);
        }
        local m: float = Stats.median(dev, n);
        free(cast<*void>(dev));
        return m;
    }

    frame covariance(x: *float, y: *float, n: int) ret float {
        if (n < 2) {
            return 0.0;
        }
        local mx: float = Stats.mean(x, n);
        local my: float = Stats.mean(y, n);
        local s: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            s = s + ((x[i] - mx) * (y[i] - my));
        }
        return s / cast<float>(n - 1);
    }

    frame correlation(x: *float, y: *float, n: int) ret float {
        local sx: float = Stats.stddev(x, n);
        local sy: float = Stats.stddev(y, n);
        if ((sx == 0.0) || (sy == 0.0)) {
            return 0.0;
        }
        return Stats.covariance(x, y, n) / (sx * sy);
    }

    # Spearman rank correlation (average ranks for ties).
    frame spearman(x: *float, y: *float, n: int) ret float {
        local rx: *float = Stats.ranks(x, n);
        local ry: *float = Stats.ranks(y, n);
        local r: float = Stats.correlation(rx, ry, n);
        free(cast<*void>(rx));
        free(cast<*void>(ry));
        return r;
    }

    frame ranks(x: *float, n: int) ret *float {
        local idx: *int = cast<*int>(malloc(cast<long>(n + 1) * sizeof(int)));
        local out: *float = cast<*float>(malloc(cast<long>(n + 1) * sizeof(float)));
        Sort.argsort(x, idx, n);
        local i: int = 0;
        loop (i < n) {
            local j: int = i;
            loop (((j + 1) < n) && (x[idx[j + 1]] == x[idx[i]])) {
                j = j + 1;
            }
            local avg: float = ((cast<float>(i) + cast<float>(j)) / 2.0) + 1.0;
            loop (local k: int = i; k <= j; k = k + 1) {
                out[idx[k]] = avg;
            }
            i = j + 1;
        }
        free(cast<*void>(idx));
        return out;
    }

    frame autocorrelation(x: *float, n: int, lag: int) ret float {
        if ((lag >= n) || (n < 2)) {
            return 0.0;
        }
        local m: float = Stats.mean(x, n);
        local num: float = 0.0;
        local den: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            local d: float = x[i] - m;
            den = den + (d * d);
            if (i >= lag) {
                num = num + (d * (x[i - lag] - m));
            }
        }
        if (den == 0.0) {
            return 0.0;
        }
        return num / den;
    }

    # Ljung-Box Q statistic over the first `lags` autocorrelations.
    frame ljungBox(x: *float, n: int, lags: int) ret float {
        local q: float = 0.0;
        local nf: float = cast<float>(n);
        loop (local k: int = 1; k <= lags; k = k + 1) {
            local r: float = Stats.autocorrelation(x, n, k);
            q = q + ((r * r) / (nf - cast<float>(k)));
        }
        return nf * (nf + 2.0) * q;
    }

    frame linearRegression(x: *float, y: *float, n: int) ret Regression {
        local r: Regression;
        r.slope = 0.0;
        r.intercept = 0.0;
        r.r2 = 0.0;
        r.stderr_slope = 0.0;
        r.stderr_intercept = 0.0;
        r.residual_stddev = 0.0;
        r.count = n;
        if (n < 2) {
            return r;
        }
        local mx: float = Stats.mean(x, n);
        local my: float = Stats.mean(y, n);
        local sxx: float = 0.0;
        local sxy: float = 0.0;
        local syy: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            local dx: float = x[i] - mx;
            local dy: float = y[i] - my;
            sxx = sxx + (dx * dx);
            sxy = sxy + (dx * dy);
            syy = syy + (dy * dy);
        }
        if (sxx == 0.0) {
            r.intercept = my;
            return r;
        }
        r.slope = sxy / sxx;
        r.intercept = my - (r.slope * mx);
        local sse: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            local e: float = y[i] - (r.intercept + (r.slope * x[i]));
            sse = sse + (e * e);
        }
        if (syy > 0.0) {
            r.r2 = 1.0 - (sse / syy);
        }
        if (n > 2) {
            local s2: float = sse / cast<float>(n - 2);
            r.residual_stddev = Math.sqrt(s2);
            r.stderr_slope = Math.sqrt(s2 / sxx);
            r.stderr_intercept = Math.sqrt(s2 * ((1.0 / cast<float>(n)) + ((mx * mx) / sxx)));
        }
        return r;
    }

    # Welch's two-sample t-test.
    frame welch(a: *float, na: int, b: *float, nb: int) ret TTest {
        local va: float = Stats.variance(a, na) / cast<float>(na);
        local vb: float = Stats.variance(b, nb) / cast<float>(nb);
        local t: float = (Stats.mean(a, na) - Stats.mean(b, nb)) / Math.sqrt(va + vb);
        local dof: float = ((va + vb) * (va + vb)) / (((va * va) / cast<float>(na - 1)) + ((vb * vb) / cast<float>(nb - 1)));
        local p: float = 2.0 * (1.0 - Special.studentTCdf(Math.abs(t), dof));
        return TTest { t: t, dof: dof, p_value: p };
    }

    # One-sample t-test of mean == mu.
    frame oneSample(x: *float, n: int, mu: float) ret TTest {
        local se: float = Stats.stddev(x, n) / Math.sqrt(cast<float>(n));
        local t: float = (Stats.mean(x, n) - mu) / se;
        local dof: float = cast<float>(n - 1);
        local p: float = 2.0 * (1.0 - Special.studentTCdf(Math.abs(t), dof));
        return TTest { t: t, dof: dof, p_value: p };
    }

    # Jarque-Bera normality statistic and its chi-square(2) p-value.
    frame jarqueBera(x: *float, n: int) ret TTest {
        local m: Moments = Stats.moments(x, n);
        local nf: float = cast<float>(n);
        local jb: float = (nf / 6.0) * ((m.skewness * m.skewness) + ((m.kurtosis * m.kurtosis) / 4.0));
        local p: float = 1.0 - Special.chiSquareCdf(jb, 2.0);
        return TTest { t: jb, dof: 2.0, p_value: p };
    }

    frame zscores(x: *float, n: int, out: *float) {
        local m: float = Stats.mean(x, n);
        local s: float = Stats.stddev(x, n);
        loop (local i: int = 0; i < n; i = i + 1) {
            out[i] = s > 0.0 ? (x[i] - m) / s : 0.0;
        }
    }

    frame ewmaVariance(x: *float, n: int, lambda: float) ret float {
        if (n == 0) {
            return 0.0;
        }
        local v: float = x[0] * x[0];
        loop (local i: int = 1; i < n; i = i + 1) {
            v = (lambda * v) + ((1.0 - lambda) * x[i] * x[i]);
        }
        return v;
    }

    # Maximum drawdown of an equity curve, as a positive fraction.
    frame maxDrawdown(equity: *float, n: int) ret float {
        if (n == 0) {
            return 0.0;
        }
        local peak: float = equity[0];
        local worst: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            if (equity[i] > peak) {
                peak = equity[i];
            }
            if (peak > 0.0) {
                local dd: float = (peak - equity[i]) / peak;
                if (dd > worst) {
                    worst = dd;
                }
            }
        }
        return worst;
    }

    frame sharpe(returns: *float, n: int, risk_free: float, periods_per_year: float) ret float {
        local s: float = Stats.stddev(returns, n);
        if (s == 0.0) {
            return 0.0;
        }
        return ((Stats.mean(returns, n) - (risk_free / periods_per_year)) / s) * Math.sqrt(periods_per_year);
    }

    frame sortino(returns: *float, n: int, target: float, periods_per_year: float) ret float {
        local down: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            if (returns[i] < target) {
                local d: float = returns[i] - target;
                down = down + (d * d);
            }
        }
        if ((n == 0) || (down == 0.0)) {
            return 0.0;
        }
        local dd: float = Math.sqrt(down / cast<float>(n));
        return ((Stats.mean(returns, n) - target) / dd) * Math.sqrt(periods_per_year);
    }

    frame geometricMean(x: *float, n: int) ret float {
        if (n == 0) {
            return 0.0;
        }
        local s: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            s = s + Math.log(x[i]);
        }
        return Math.exp(s / cast<float>(n));
    }

    frame harmonicMean(x: *float, n: int) ret float {
        local s: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            s = s + (1.0 / x[i]);
        }
        if (s == 0.0) {
            return 0.0;
        }
        return cast<float>(n) / s;
    }

    # Weighted mean; weights need not be normalized.
    frame weightedMean(x: *float, w: *float, n: int) ret float {
        local sw: float = 0.0;
        local s: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            s = s + (x[i] * w[i]);
            sw = sw + w[i];
        }
        if (sw == 0.0) {
            return 0.0;
        }
        return s / sw;
    }

    # Hurst exponent estimate by rescaled range over doubling windows.
    frame hurst(x: *float, n: int) ret float {
        local logs_n: float[32];
        local logs_rs: float[32];
        local count: int = 0;
        local size: int = 8;
        loop ((size <= (n / 2)) && (count < 32)) {
            local chunks: int = n / size;
            local rs_sum: float = 0.0;
            loop (local c: int = 0; c < chunks; c = c + 1) {
                local base: *float = x + (c * size);
                local m: float = Stats.mean(base, size);
                local cum: float = 0.0;
                local lo: float = 0.0;
                local hi: float = 0.0;
                local ss: float = 0.0;
                loop (local i: int = 0; i < size; i = i + 1) {
                    local d: float = base[i] - m;
                    cum = cum + d;
                    ss = ss + (d * d);
                    if (cum < lo) {
                        lo = cum;
                    }
                    if (cum > hi) {
                        hi = cum;
                    }
                }
                local sd: float = Math.sqrt(ss / cast<float>(size));
                if (sd > 0.0) {
                    rs_sum = rs_sum + ((hi - lo) / sd);
                }
            }
            logs_n[count] = Math.log(cast<float>(size));
            logs_rs[count] = Math.log(rs_sum / cast<float>(chunks));
            count = count + 1;
            size = size * 2;
        }
        if (count < 2) {
            return 0.5;
        }
        local reg: Regression = Stats.linearRegression(&logs_n[0], &logs_rs[0], count);
        return reg.slope;
    }
}
