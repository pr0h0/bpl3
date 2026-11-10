# Kalman filtering and pairs analysis.
#
# LocalLevel: random-walk-plus-noise smoother for a price series, with
# Rauch-Tung-Striebel smoothing and a log-likelihood for tuning.
# DynamicHedge: time-varying regression y_t = a_t + b_t x_t + e_t with
# random-walk coefficients (the classic pairs-trading hedge ratio filter).
# Cointegration: Engle-Granger two-step test and the Ornstein-Uhlenbeck
# half-life of the spread.

import malloc, free from "std/c.bpl";
import [Math], PI from "std/math.bpl";
import [Stats], [Regression] from "../math/stats.bpl";
import [Arima], [UnitRoot] from "./arima.bpl";

export [LocalLevel];
export [DynamicHedge];
export [Cointegration];
export [CointegrationResult];

struct LocalLevel {
    # Filters x into level (filtered) and smoothed; returns the log-likelihood.
    frame filter(x: *float, n: int, obs_var: float, level_var: float, filtered: *float, smoothed: *float) ret float {
        local p_pred: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        local p_filt: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        local level: float = x[0];
        local p: float = obs_var * 1000.0;
        local ll: float = 0.0;
        loop (local t: int = 0; t < n; t = t + 1) {
            local pp: float = p + level_var;
            local f: float = pp + obs_var;
            local v: float = x[t] - level;
            local k: float = pp / f;
            level = level + (k * v);
            p = (1.0 - k) * pp;
            p_pred[t] = pp;
            p_filt[t] = p;
            filtered[t] = level;
            if (t > 0) {
                ll = ll - (0.5 * (Math.log(2.0 * PI * f) + ((v * v) / f)));
            }
        }
        smoothed[n - 1] = filtered[n - 1];
        local t: int = n - 2;
        loop (t >= 0) {
            local j: float = p_filt[t] / p_pred[t + 1];
            smoothed[t] = filtered[t] + (j * (smoothed[t + 1] - filtered[t]));
            t = t - 1;
        }
        free(cast<*void>(p_pred));
        free(cast<*void>(p_filt));
        return ll;
    }

    # Picks the signal-to-noise ratio q = level_var / obs_var by likelihood grid search.
    frame tune(x: *float, n: int, obs_var: float, best_q: *float) ret float {
        local filtered: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        local smoothed: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        local best: float = -1000000000000.0;
        local q: float = 0.0001;
        loop (q < 100.0) {
            local ll: float = LocalLevel.filter(x, n, obs_var, obs_var * q, filtered, smoothed);
            if (ll > best) {
                best = ll;
                *best_q = q;
            }
            q = q * 1.5;
        }
        free(cast<*void>(filtered));
        free(cast<*void>(smoothed));
        return best;
    }
}

struct DynamicHedge {
    # Writes intercept, hedge ratio and the one-step prediction error per bar.
    frame run(y: *float, x: *float, n: int, delta: float, obs_var: float, alpha: *float, beta: *float, err: *float) {
        # State [a, b] with covariance P; transition covariance W = delta / (1 - delta) I.
        local a: float = 0.0;
        local b: float = 0.0;
        local p00: float = 1.0;
        local p01: float = 0.0;
        local p11: float = 1.0;
        local w: float = delta / (1.0 - delta);
        loop (local t: int = 0; t < n; t = t + 1) {
            p00 = p00 + w;
            p11 = p11 + w;
            # Observation row H = [1, x_t].
            local xt: float = x[t];
            local pred: float = a + (b * xt);
            local e: float = y[t] - pred;
            local ph0: float = p00 + (p01 * xt);
            local ph1: float = p01 + (p11 * xt);
            local s: float = ph0 + (ph1 * xt) + obs_var;
            local k0: float = ph0 / s;
            local k1: float = ph1 / s;
            a = a + (k0 * e);
            b = b + (k1 * e);
            local n00: float = p00 - (k0 * ph0);
            local n01: float = p01 - (k0 * ph1);
            local n11: float = p11 - (k1 * ph1);
            p00 = n00;
            p01 = n01;
            p11 = n11;
            alpha[t] = a;
            beta[t] = b;
            err[t] = e;
        }
    }
}

struct CointegrationResult {
    hedge_ratio: float,
    intercept: float,
    r2: float,
    adf: UnitRoot,
    half_life: float,
    spread_mean: float,
    spread_std: float,
    zscore: float,
}

struct Cointegration {
    frame engleGranger(y: *float, x: *float, n: int, lags: int) ret CointegrationResult {
        local reg: Regression = Stats.linearRegression(x, y, n);
        local spread: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        loop (local t: int = 0; t < n; t = t + 1) {
            spread[t] = y[t] - reg.intercept - (reg.slope * x[t]);
        }
        local r: CointegrationResult;
        r.hedge_ratio = reg.slope;
        r.intercept = reg.intercept;
        r.r2 = reg.r2;
        r.adf = Arima.adf(spread, n, lags);
        # Engle-Granger critical values (two variables, constant) are stricter.
        r.adf.critical_1 = -3.90;
        r.adf.critical_5 = -3.34;
        r.adf.critical_10 = -3.04;
        r.adf.reject_5 = r.adf.statistic < -3.34;
        r.half_life = Cointegration.halfLife(spread, n);
        r.spread_mean = Stats.mean(spread, n);
        r.spread_std = Stats.stddev(spread, n);
        r.zscore = r.spread_std > 0.0 ? (spread[n - 1] - r.spread_mean) / r.spread_std : 0.0;
        free(cast<*void>(spread));
        return r;
    }

    # Half-life of mean reversion from regressing d(s_t) on s_{t-1}.
    frame halfLife(s: *float, n: int) ret float {
        local lagged: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        local delta: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        loop (local t: int = 1; t < n; t = t + 1) {
            lagged[t - 1] = s[t - 1];
            delta[t - 1] = s[t] - s[t - 1];
        }
        local reg: Regression = Stats.linearRegression(lagged, delta, n - 1);
        free(cast<*void>(lagged));
        free(cast<*void>(delta));
        if (reg.slope >= 0.0) {
            return 1.0 / 0.0;
        }
        # A slope at or below -1 means the spread fully reverts within one step.
        if (reg.slope <= -0.999999) {
            return 0.0;
        }
        return -Math.log(2.0) / Math.log(1.0 + reg.slope);
    }
}
