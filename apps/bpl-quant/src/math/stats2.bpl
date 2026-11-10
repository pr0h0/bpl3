# Further statistics: rank and distribution tests, performance ratios,
# Sharpe-ratio inference, drawdown episodes, tail estimators and
# heteroskedasticity/autocorrelation-robust standard errors.

import malloc, free from "std/c.bpl";
import [Math] from "std/math.bpl";
import [Sort] from "./sort.bpl";
import [Stats] from "./stats.bpl";
import [Special] from "./special.bpl";

export [Stats2];
export [TestResult];
export [Drawdown];
export [DrawdownTable];

struct TestResult {
    statistic: float,
    p_value: float,
}

struct Drawdown {
    start: int,
    trough: int,
    # Index where the previous peak was regained (-1 = not recovered).
    end: int,
    depth: float,
}

struct DrawdownTable {
    items: Drawdown[16],
    count: int,
    max_duration: int,
    time_under_water: float,
}

struct Stats2 {
    frame mean(x: *float, n: int) ret float {
        local s: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            s = s + x[i];
        }
        return n > 0 ? s / cast<float>(n) : 0.0;
    }

    frame stdev(x: *float, n: int) ret float {
        if (n < 2) {
            return 0.0;
        }
        local m: float = Stats2.mean(x, n);
        local s: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            s = s + ((x[i] - m) * (x[i] - m));
        }
        return Math.sqrt(s / cast<float>(n - 1));
    }

    # Kendall's tau-b with tie correction, O(n^2), and its normal-approximation
    # p-value (two-sided).
    frame kendall(x: *float, y: *float, n: int) ret TestResult {
        local concordant: float = 0.0;
        local discordant: float = 0.0;
        local ties_x: float = 0.0;
        local ties_y: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            loop (local j: int = i + 1; j < n; j = j + 1) {
                local dx: float = x[i] - x[j];
                local dy: float = y[i] - y[j];
                if ((dx == 0.0) && (dy == 0.0)) {
                    continue;
                }
                if (dx == 0.0) {
                    ties_x = ties_x + 1.0;
                } else if (dy == 0.0) {
                    ties_y = ties_y + 1.0;
                } else if ((dx * dy) > 0.0) {
                    concordant = concordant + 1.0;
                } else {
                    discordant = discordant + 1.0;
                }
            }
        }
        local denom: float = Math.sqrt((concordant + discordant + ties_x) * (concordant + discordant + ties_y));
        local tau: float = denom > 0.0 ? (concordant - discordant) / denom : 0.0;
        local nf: float = cast<float>(n);
        local var: float = (2.0 * ((2.0 * nf) + 5.0)) / (9.0 * nf * (nf - 1.0));
        local z: float = var > 0.0 ? tau / Math.sqrt(var) : 0.0;
        return TestResult { statistic: tau, p_value: 2.0 * (1.0 - Special.normCdf(Math.abs(z))) };
    }

    # Kolmogorov distribution tail: P(K > lambda).
    frame kolmogorovQ(lambda: float) ret float {
        if (lambda < 0.27) {
            return 1.0;
        }
        local s: float = 0.0;
        loop (local k: int = 1; k <= 100; k = k + 1) {
            local kf: float = cast<float>(k);
            local term: float = Math.exp(-2.0 * kf * kf * lambda * lambda);
            s = (k % 2) == 1 ? s + term : s - term;
            if (term < 0.0000000001) {
                break;
            }
        }
        return Math.max(0.0, Math.min(1.0, 2.0 * s));
    }

    # Two-sample Kolmogorov-Smirnov test.
    frame ks2(a: *float, na: int, b: *float, nb: int) ret TestResult {
        local sa: *float = Sort.copySorted(a, na);
        local sb: *float = Sort.copySorted(b, nb);
        local i: int = 0;
        local j: int = 0;
        local d: float = 0.0;
        loop ((i < na) && (j < nb)) {
            local v: float = sa[i] <= sb[j] ? sa[i] : sb[j];
            loop ((i < na) && (sa[i] <= v)) {
                i = i + 1;
            }
            loop ((j < nb) && (sb[j] <= v)) {
                j = j + 1;
            }
            local diff: float = Math.abs((cast<float>(i) / cast<float>(na)) - (cast<float>(j) / cast<float>(nb)));
            d = Math.max(d, diff);
        }
        free(cast<*void>(sa));
        free(cast<*void>(sb));
        local ne: float = (cast<float>(na) * cast<float>(nb)) / cast<float>(na + nb);
        local root: float = Math.sqrt(ne);
        local lambda: float = (root + 0.12 + (0.11 / root)) * d;
        return TestResult { statistic: d, p_value: Stats2.kolmogorovQ(lambda) };
    }

    # One-sample KS test against the normal with the sample's mean/stdev
    # (Lilliefors-style statistic, Kolmogorov p-value as an approximation).
    frame ksNormal(x: *float, n: int) ret TestResult {
        local m: float = Stats2.mean(x, n);
        local s: float = Stats2.stdev(x, n);
        local sorted: *float = Sort.copySorted(x, n);
        local d: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            local f: float = Special.normCdf((sorted[i] - m) / s);
            d = Math.max(d, Math.max(f - (cast<float>(i) / cast<float>(n)), (cast<float>(i + 1) / cast<float>(n)) - f));
        }
        free(cast<*void>(sorted));
        local root: float = Math.sqrt(cast<float>(n));
        return TestResult { statistic: d, p_value: Stats2.kolmogorovQ((root + 0.12 + (0.11 / root)) * d) };
    }

    # Mann-Whitney U with average ranks for ties; normal approximation.
    frame mannWhitney(a: *float, na: int, b: *float, nb: int) ret TestResult {
        local n: int = na + nb;
        local all: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        local idx: *int = cast<*int>(malloc(cast<long>(n) * sizeof(int)));
        loop (local i: int = 0; i < na; i = i + 1) {
            all[i] = a[i];
        }
        loop (local i: int = 0; i < nb; i = i + 1) {
            all[na + i] = b[i];
        }
        Sort.argsort(all, idx, n);
        local rank_a: float = 0.0;
        local tie_term: float = 0.0;
        local i: int = 0;
        loop (i < n) {
            local j: int = i;
            loop (((j + 1) < n) && (all[idx[j + 1]] == all[idx[i]])) {
                j = j + 1;
            }
            local avg: float = (cast<float>(i + j) / 2.0) + 1.0;
            local t: float = cast<float>((j - i) + 1);
            tie_term = tie_term + ((t * t * t) - t);
            loop (local k: int = i; k <= j; k = k + 1) {
                if (idx[k] < na) {
                    rank_a = rank_a + avg;
                }
            }
            i = j + 1;
        }
        free(cast<*void>(all));
        free(cast<*void>(idx));
        local fa: float = cast<float>(na);
        local fb: float = cast<float>(nb);
        local u: float = rank_a - ((fa * (fa + 1.0)) / 2.0);
        local mu: float = (fa * fb) / 2.0;
        local nf: float = fa + fb;
        local sigma: float = Math.sqrt(((fa * fb) / 12.0) * ((nf + 1.0) - (tie_term / (nf * (nf - 1.0)))));
        local z: float = sigma > 0.0 ? (u - mu) / sigma : 0.0;
        return TestResult { statistic: u, p_value: 2.0 * (1.0 - Special.normCdf(Math.abs(z))) };
    }

    # Anderson-Darling normality test (estimated mean/stdev, Stephens'
    # small-sample adjustment and D'Agostino's p-value formulas).
    frame andersonDarling(x: *float, n: int) ret TestResult {
        local m: float = Stats2.mean(x, n);
        local s: float = Stats2.stdev(x, n);
        local sorted: *float = Sort.copySorted(x, n);
        local a2: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            local fi: float = Special.normCdf((sorted[i] - m) / s);
            local fj: float = Special.normCdf((sorted[(n - 1) - i] - m) / s);
            fi = Math.max(0.0000000000001, Math.min(0.9999999999999, fi));
            fj = Math.max(0.0000000000001, Math.min(0.9999999999999, fj));
            a2 = a2 + (cast<float>((2 * i) + 1) * (Math.log(fi) + Math.log(1.0 - fj)));
        }
        free(cast<*void>(sorted));
        local nf: float = cast<float>(n);
        a2 = -nf - (a2 / nf);
        local adj: float = a2 * (1.0 + (0.75 / nf) + (2.25 / (nf * nf)));
        local p: float = 0.0;
        if (adj >= 0.6) {
            p = Math.exp((1.2937 - (5.709 * adj)) + (0.0186 * adj * adj));
        } else if (adj >= 0.34) {
            p = Math.exp(0.9177 - (4.279 * adj) - (1.38 * adj * adj));
        } else if (adj >= 0.2) {
            p = 1.0 - Math.exp((-8.318 + (42.796 * adj)) - (59.938 * adj * adj));
        } else {
            p = 1.0 - Math.exp((-13.436 + (101.14 * adj)) - (223.73 * adj * adj));
        }
        return TestResult { statistic: adj, p_value: Math.max(0.0, Math.min(1.0, p)) };
    }

    # Omega ratio at `threshold`: E[(r - t)+] / E[(t - r)+].
    frame omega(r: *float, n: int, threshold: float) ret float {
        local up: float = 0.0;
        local down: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            local d: float = r[i] - threshold;
            if (d > 0.0) {
                up = up + d;
            } else {
                down = down - d;
            }
        }
        return down > 0.0 ? up / down : 1000000000000000000000000000000.0;
    }

    # Annualised return over max drawdown, from periodic simple returns.
    frame calmar(r: *float, n: int, periods_per_year: float) ret float {
        local wealth: float = 1.0;
        local peak: float = 1.0;
        local mdd: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            wealth = wealth * (1.0 + r[i]);
            peak = Math.max(peak, wealth);
            mdd = Math.max(mdd, 1.0 - (wealth / peak));
        }
        local years: float = cast<float>(n) / periods_per_year;
        local cagr: float = years > 0.0 ? Math.pow(wealth, 1.0 / years) - 1.0 : 0.0;
        return mdd > 0.0 ? cagr / mdd : 0.0;
    }

    # Kappa-n: (mean - t) / (lower partial moment of order n)^(1/n).
    frame kappa(r: *float, n: int, threshold: float, order: float) ret float {
        local lpm: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            if (r[i] < threshold) {
                lpm = lpm + Math.pow(threshold - r[i], order);
            }
        }
        lpm = lpm / cast<float>(n);
        if (lpm <= 0.0) {
            return 0.0;
        }
        return (Stats2.mean(r, n) - threshold) / Math.pow(lpm, 1.0 / order);
    }

    # Ratio of the 95th percentile return to the absolute 5th percentile.
    frame tailRatio(r: *float, n: int) ret float {
        local hi: float = Stats.quantile(r, n, 0.95);
        local lo: float = Stats.quantile(r, n, 0.05);
        return lo != 0.0 ? Math.abs(hi / lo) : 0.0;
    }

    frame skewKurt(r: *float, n: int, skew: *float, kurt: *float) {
        local m: float = Stats2.mean(r, n);
        local m2: float = 0.0;
        local m3: float = 0.0;
        local m4: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            local d: float = r[i] - m;
            m2 = m2 + (d * d);
            m3 = m3 + (d * d * d);
            m4 = m4 + (d * d * d * d);
        }
        local nf: float = cast<float>(n);
        m2 = m2 / nf;
        m3 = m3 / nf;
        m4 = m4 / nf;
        *skew = m2 > 0.0 ? m3 / Math.pow(m2, 1.5) : 0.0;
        *kurt = m2 > 0.0 ? m4 / (m2 * m2) : 3.0;
    }

    # Probabilistic Sharpe ratio (Bailey and Lopez de Prado): probability
    # that the true per-period Sharpe exceeds `benchmark` given skew and
    # kurtosis of the sample.
    frame probabilisticSharpe(r: *float, n: int, benchmark: float) ret float {
        local sd: float = Stats2.stdev(r, n);
        if (sd <= 0.0) {
            return 0.0;
        }
        local sr: float = Stats2.mean(r, n) / sd;
        local skew: float = 0.0;
        local kurt: float = 0.0;
        Stats2.skewKurt(r, n, &skew, &kurt);
        local denom: float = Math.sqrt((1.0 - (skew * sr)) + (((kurt - 1.0) / 4.0) * sr * sr));
        return Special.normCdf(((sr - benchmark) * Math.sqrt(cast<float>(n - 1))) / denom);
    }

    # Expected maximum Sharpe of `trials` independent strategies with
    # Sharpe variance `var_sr` (the deflated-Sharpe benchmark).
    frame expectedMaxSharpe(trials: int, var_sr: float) ret float {
        local euler: float = 0.5772156649015329;
        local t: float = cast<float>(trials);
        local a: float = Special.invNormCdf(1.0 - (1.0 / t));
        local b: float = Special.invNormCdf(1.0 - (1.0 / (t * Math.exp(1.0))));
        return Math.sqrt(var_sr) * (((1.0 - euler) * a) + (euler * b));
    }

    frame deflatedSharpe(r: *float, n: int, trials: int, var_sr: float) ret float {
        return Stats2.probabilisticSharpe(r, n, Stats2.expectedMaxSharpe(trials, var_sr));
    }

    # Largest drawdown episodes of a price/wealth series (at most 16),
    # deepest first.
    frame drawdowns(x: *float, n: int) ret DrawdownTable {
        local t: DrawdownTable;
        t.count = 0;
        t.max_duration = 0;
        local under: int = 0;
        local peak_i: int = 0;
        local trough_i: int = 0;
        local in_dd: bool = false;
        loop (local i: int = 1; i <= n; i = i + 1) {
            local closing: bool = i == n;
            if (!closing && (x[i] >= x[peak_i])) {
                if (in_dd) {
                    Stats2.record(&t, Drawdown { start: peak_i, trough: trough_i, end: i, depth: 1.0 - (x[trough_i] / x[peak_i]) });
                    if ((i - peak_i) > t.max_duration) {
                        t.max_duration = i - peak_i;
                    }
                    in_dd = false;
                }
                peak_i = i;
                trough_i = i;
                continue;
            }
            if (closing) {
                if (in_dd) {
                    Stats2.record(&t, Drawdown { start: peak_i, trough: trough_i, end: -1, depth: 1.0 - (x[trough_i] / x[peak_i]) });
                    if ((n - peak_i) > t.max_duration) {
                        t.max_duration = n - peak_i;
                    }
                }
                break;
            }
            in_dd = true;
            under = under + 1;
            if (x[i] < x[trough_i]) {
                trough_i = i;
            }
        }
        t.time_under_water = n > 1 ? cast<float>(under) / cast<float>(n - 1) : 0.0;
        return t;
    }

    # Keeps the 16 deepest episodes, sorted by depth.
    frame record(t: *DrawdownTable, d: Drawdown) {
        local pos: int = t.count;
        loop ((pos > 0) && (t.items[pos - 1].depth < d.depth)) {
            pos = pos - 1;
        }
        if (pos >= 16) {
            return;
        }
        local last: int = t.count < 16 ? t.count : 15;
        loop (local k: int = last; k > pos; k = k - 1) {
            t.items[k] = t.items[k - 1];
        }
        t.items[pos] = d;
        if (t.count < 16) {
            t.count = t.count + 1;
        }
    }

    # Hill estimator of the tail index from the k largest losses.
    frame hill(r: *float, n: int, k: int) ret float {
        local losses: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        loop (local i: int = 0; i < n; i = i + 1) {
            losses[i] = -r[i];
        }
        Sort.floats(losses, n);
        local kk: int = k >= n ? n - 1 : k;
        local threshold: float = losses[(n - 1) - kk];
        local s: float = 0.0;
        loop (local i: int = 0; i < kk; i = i + 1) {
            s = s + Math.log(losses[(n - 1) - i] / threshold);
        }
        free(cast<*void>(losses));
        return s > 0.0 ? cast<float>(kk) / s : 0.0;
    }

    # Cornish-Fisher VaR (loss, positive) at `confidence`.
    frame cornishFisherVar(r: *float, n: int, confidence: float) ret float {
        local m: float = Stats2.mean(r, n);
        local sd: float = Stats2.stdev(r, n);
        local skew: float = 0.0;
        local kurt: float = 0.0;
        Stats2.skewKurt(r, n, &skew, &kurt);
        local ex: float = kurt - 3.0;
        local z: float = Special.invNormCdf(1.0 - confidence);
        local zcf: float = (z + ((((z * z) - 1.0) * skew) / 6.0) + ((((z * z * z) - (3.0 * z)) * ex) / 24.0)) - ((((2.0 * z * z * z) - (5.0 * z)) * skew * skew) / 36.0);
        return -(m + (zcf * sd));
    }

    # OLS slope of y on x with Newey-West (Bartlett, `lags`) standard error.
    frame neweyWest(x: *float, y: *float, n: int, lags: int, slope: *float, se: *float) {
        local mx: float = Stats2.mean(x, n);
        local my: float = Stats2.mean(y, n);
        local sxx: float = 0.0;
        local sxy: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            sxx = sxx + ((x[i] - mx) * (x[i] - mx));
            sxy = sxy + ((x[i] - mx) * (y[i] - my));
        }
        local b: float = sxx > 0.0 ? sxy / sxx : 0.0;
        local a: float = my - (b * mx);
        local u: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        loop (local i: int = 0; i < n; i = i + 1) {
            u[i] = (x[i] - mx) * (y[i] - a - (b * x[i]));
        }
        local s: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            s = s + (u[i] * u[i]);
        }
        loop (local l: int = 1; l <= lags; l = l + 1) {
            local w: float = 1.0 - (cast<float>(l) / cast<float>(lags + 1));
            local g: float = 0.0;
            loop (local i: int = l; i < n; i = i + 1) {
                g = g + (u[i] * u[i - l]);
            }
            s = s + (2.0 * w * g);
        }
        free(cast<*void>(u));
        *slope = b;
        *se = sxx > 0.0 ? Math.sqrt(s) / sxx : 0.0;
    }
}
