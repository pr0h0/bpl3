# Value at Risk and Expected Shortfall.
#
# Conventions: returns are fractional (0.01 = 1%), losses are reported as
# positive numbers, and `value` scales results to currency.

import malloc, free from "std/c.bpl";
import [Math] from "std/math.bpl";
import [Matrix] from "../math/matrix.bpl";
import [Special] from "../math/special.bpl";
import [Stats], [Moments] from "../math/stats.bpl";
import [Sort] from "../math/sort.bpl";
import [Xoshiro] from "../core/prng.bpl";
import [ReturnPanel] from "./covariance.bpl";

export [VaR];
export [VarReport];
export [BacktestResult];

struct VarReport {
    confidence: float,
    horizon_days: float,
    var: float,
    es: float,
    method: string,
}

struct BacktestResult {
    observations: int,
    exceptions: int,
    expected: float,
    kupiec_lr: float,
    kupiec_p: float,
    christoffersen_lr: float,
    zone: string,
}

struct VaR {
    # Historical simulation VaR/ES of a return series.
    frame historical(returns: *float, n: int, confidence: float, value: float) ret VarReport {
        local losses: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        loop (local i: int = 0; i < n; i = i + 1) {
            losses[i] = -returns[i];
        }
        Sort.floats(losses, n);
        local var: float = Stats.quantileSorted(losses, n, confidence);
        local tail_sum: float = 0.0;
        local tail_n: int = 0;
        loop (local i: int = 0; i < n; i = i + 1) {
            if (losses[i] >= var) {
                tail_sum = tail_sum + losses[i];
                tail_n = tail_n + 1;
            }
        }
        free(cast<*void>(losses));
        local es: float = tail_n > 0 ? tail_sum / cast<float>(tail_n) : var;
        return VarReport { confidence: confidence, horizon_days: 1.0, var: var * value, es: es * value, method: "historical" };
    }

    # Gaussian parametric VaR/ES with sqrt-time scaling.
    frame parametric(mean: float, stddev: float, confidence: float, horizon_days: float, value: float) ret VarReport {
        local z: float = Special.invNormCdf(confidence);
        local h: float = Math.sqrt(horizon_days);
        local var: float = ((z * stddev * h) - (mean * horizon_days)) * value;
        local es: float = (((stddev * h * Special.normPdf(z)) / (1.0 - confidence)) - (mean * horizon_days)) * value;
        return VarReport { confidence: confidence, horizon_days: horizon_days, var: var, es: es, method: "parametric" };
    }

    # Cornish-Fisher modified VaR using sample skewness and excess kurtosis.
    frame cornishFisher(returns: *float, n: int, confidence: float, value: float) ret VarReport {
        local m: Moments = Stats.moments(returns, n);
        local z: float = Special.invNormCdf(1.0 - confidence);
        local s: float = m.skewness;
        local k: float = m.kurtosis;
        local zcf: float = (z + ((((z * z) - 1.0) * s) / 6.0) + ((((z * z * z) - (3.0 * z)) * k) / 24.0)) - ((((2.0 * z * z * z) - (5.0 * z)) * s * s) / 36.0);
        local var: float = -(m.mean + (zcf * m.stddev)) * value;
        return VarReport { confidence: confidence, horizon_days: 1.0, var: var, es: var, method: "cornish_fisher" };
    }

    # Portfolio parametric VaR from weights and a covariance matrix.
    frame portfolio(weights: *float, mu: *float, cov: *Matrix, confidence: float, horizon_days: float, value: float) ret VarReport {
        local n: int = cov.rows;
        local mean: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            mean = mean + (weights[i] * mu[i]);
        }
        local variance: float = cov.quadForm(weights);
        return VaR.parametric(mean, Math.sqrt(variance), confidence, horizon_days, value);
    }

    # Component VaR: contribution of each asset; contributions sum to total VaR.
    frame components(weights: *float, cov: *Matrix, confidence: float, value: float, out: *float) ret float {
        local n: int = cov.rows;
        local sigma_w: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        cov.mulVec(weights, sigma_w);
        local variance: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            variance = variance + (weights[i] * sigma_w[i]);
        }
        local sd: float = Math.sqrt(variance);
        local z: float = Special.invNormCdf(confidence);
        local total: float = z * sd * value;
        loop (local i: int = 0; i < n; i = i + 1) {
            local marginal: float = (z * sigma_w[i]) / sd;
            out[i] = weights[i] * marginal * value;
        }
        free(cast<*void>(sigma_w));
        return total;
    }

    # Monte Carlo VaR of a linear portfolio under multivariate normal returns.
    frame monteCarlo(weights: *float, mu: *float, cov: *Matrix, confidence: float, value: float, paths: int, seed: u64) ret VarReport {
        local n: int = cov.rows;
        local l: Matrix;
        if (!cov.cholesky(&l)) {
            l.destroy();
            return VarReport { confidence: confidence, horizon_days: 1.0, var: 0.0 / 0.0, es: 0.0 / 0.0, method: "monte_carlo" };
        }
        local rng: Xoshiro = Xoshiro.new(seed);
        local z: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        local pnl: *float = cast<*float>(malloc(cast<long>(paths) * sizeof(float)));
        loop (local p: int = 0; p < paths; p = p + 1) {
            loop (local i: int = 0; i < n; i = i + 1) {
                z[i] = rng.normal();
            }
            local r: float = 0.0;
            loop (local i: int = 0; i < n; i = i + 1) {
                local ri: float = mu[i];
                loop (local j: int = 0; j <= i; j = j + 1) {
                    ri = ri + (l.at(i, j) * z[j]);
                }
                r = r + (weights[i] * ri);
            }
            pnl[p] = r;
        }
        local rep: VarReport = VaR.historical(pnl, paths, confidence, value);
        rep.method = "monte_carlo";
        free(cast<*void>(z));
        free(cast<*void>(pnl));
        l.destroy();
        return rep;
    }

    # Filtered historical simulation: rescale past returns by EWMA volatility.
    frame filteredHistorical(returns: *float, n: int, lambda: float, confidence: float, value: float) ret VarReport {
        local scaled: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        local var_t: float = returns[0] * returns[0];
        local vols: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        loop (local i: int = 0; i < n; i = i + 1) {
            if (i > 0) {
                var_t = (lambda * var_t) + ((1.0 - lambda) * returns[i - 1] * returns[i - 1]);
            }
            vols[i] = Math.sqrt(var_t);
        }
        local current: float = Math.sqrt((lambda * var_t) + ((1.0 - lambda) * returns[n - 1] * returns[n - 1]));
        loop (local i: int = 0; i < n; i = i + 1) {
            scaled[i] = vols[i] > 0.0 ? (returns[i] / vols[i]) * current : returns[i];
        }
        local rep: VarReport = VaR.historical(scaled, n, confidence, value);
        rep.method = "filtered_historical";
        free(cast<*void>(scaled));
        free(cast<*void>(vols));
        return rep;
    }

    # Kupiec proportion-of-failures and Christoffersen independence tests
    # for a series of VaR forecasts against realized returns.
    frame backtest(returns: *float, forecasts: *float, n: int, confidence: float) ret BacktestResult {
        local r: BacktestResult;
        r.observations = n;
        r.exceptions = 0;
        local n00: int = 0;
        local n01: int = 0;
        local n10: int = 0;
        local n11: int = 0;
        local prev: bool = false;
        loop (local i: int = 0; i < n; i = i + 1) {
            local hit: bool = -returns[i] > forecasts[i];
            if (hit) {
                r.exceptions = r.exceptions + 1;
            }
            if (i > 0) {
                if (!prev && !hit) {
                    n00 = n00 + 1;
                } else if (!prev && hit) {
                    n01 = n01 + 1;
                } else if (prev && !hit) {
                    n10 = n10 + 1;
                } else {
                    n11 = n11 + 1;
                }
            }
            prev = hit;
        }
        local p: float = 1.0 - confidence;
        r.expected = p * cast<float>(n);
        local x: float = cast<float>(r.exceptions);
        local nf: float = cast<float>(n);
        local phat: float = x / nf;
        local ll0: float = ((nf - x) * Math.log(1.0 - p)) + (x * Math.log(p));
        local ll1: float = 0.0;
        if ((phat > 0.0) && (phat < 1.0)) {
            ll1 = ((nf - x) * Math.log(1.0 - phat)) + (x * Math.log(phat));
        } else {
            ll1 = 0.0;
        }
        r.kupiec_lr = -2.0 * (ll0 - ll1);
        r.kupiec_p = 1.0 - Special.chiSquareCdf(r.kupiec_lr, 1.0);
        local pi0: float = (n00 + n01) > 0 ? cast<float>(n01) / cast<float>(n00 + n01) : 0.0;
        local pi1: float = (n10 + n11) > 0 ? cast<float>(n11) / cast<float>(n10 + n11) : 0.0;
        local pi: float = cast<float>(n01 + n11) / cast<float>(n00 + n01 + n10 + n11);
        local l_ind: float = 0.0;
        local l_null: float = 0.0;
        if ((pi > 0.0) && (pi < 1.0)) {
            l_null = (cast<float>(n00 + n10) * Math.log(1.0 - pi)) + (cast<float>(n01 + n11) * Math.log(pi));
            if ((pi0 > 0.0) && (pi0 < 1.0)) {
                l_ind = l_ind + (cast<float>(n00) * Math.log(1.0 - pi0)) + (cast<float>(n01) * Math.log(pi0));
            }
            if ((pi1 > 0.0) && (pi1 < 1.0)) {
                l_ind = l_ind + (cast<float>(n10) * Math.log(1.0 - pi1)) + (cast<float>(n11) * Math.log(pi1));
            }
            r.christoffersen_lr = -2.0 * (l_null - l_ind);
        } else {
            r.christoffersen_lr = 0.0;
        }
        # Basel traffic-light zones for 250 observations at 99%, scaled by n.
        local scale: float = nf / 250.0;
        if (x <= (4.0 * scale)) {
            r.zone = "green";
        } else if (x <= (9.0 * scale)) {
            r.zone = "yellow";
        } else {
            r.zone = "red";
        }
        return r;
    }

    # Rolling one-day historical VaR forecasts over a window.
    frame rollingHistorical(returns: *float, n: int, window: int, confidence: float, out: *float) {
        loop (local i: int = 0; i < n; i = i + 1) {
            if (i < window) {
                out[i] = 0.0 / 0.0;
                continue;
            }
            local rep: VarReport = VaR.historical(returns + (i - window), window, confidence, 1.0);
            out[i] = rep.var;
        }
    }

    # Stress test: portfolio P&L under fixed per-asset shocks.
    frame stress(weights: *float, shocks: *float, n: int, value: float) ret float {
        local pnl: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            pnl = pnl + (weights[i] * shocks[i]);
        }
        return pnl * value;
    }

    # Worst historical scenario for the portfolio across the panel.
    frame worstScenario(panel: *ReturnPanel, weights: *float, out_index: *int) ret float {
        local worst: float = 0.0;
        local idx: int = -1;
        loop (local t: int = 0; t < panel.periods; t = t + 1) {
            local r: float = 0.0;
            loop (local i: int = 0; i < panel.assets; i = i + 1) {
                r = r + (weights[i] * panel.at(i, t));
            }
            if ((idx < 0) || (r < worst)) {
                worst = r;
                idx = t;
            }
        }
        *out_index = idx;
        return worst;
    }
}
