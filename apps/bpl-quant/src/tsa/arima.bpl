# Linear time-series models.
#
# Autocorrelation/partial autocorrelation (Durbin-Levinson), AR(p) by
# Yule-Walker, ARMA(p, q) by conditional sum of squares with Nelder-Mead,
# multi-step forecasts with differencing (ARIMA d), information criteria,
# the augmented Dickey-Fuller unit-root test and the KPSS stationarity test.

import malloc, free from "std/c.bpl";
import [Math], PI from "std/math.bpl";
import [Stats] from "../math/stats.bpl";
import [Matrix] from "../math/matrix.bpl";
import [Optimize], [MinResult] from "../math/optimize.bpl";

export [Arima];
export [ArmaFit];
export [UnitRoot];

struct ArmaFit {
    p: int,
    q: int,
    d: int,
    mean: float,
    phi: float[8],
    theta: float[8],
    sigma2: float,
    css: float,
    aic: float,
    bic: float,
    n: int,
}

struct UnitRoot {
    statistic: float,
    lags: int,
    critical_1: float,
    critical_5: float,
    critical_10: float,
    reject_5: bool,
}

struct Arima {
    frame acf(x: *float, n: int, max_lag: int, out: *float) {
        out[0] = 1.0;
        loop (local k: int = 1; k <= max_lag; k = k + 1) {
            out[k] = Stats.autocorrelation(x, n, k);
        }
    }

    # Partial autocorrelations via the Durbin-Levinson recursion.
    frame pacf(x: *float, n: int, max_lag: int, out: *float) {
        local r: *float = cast<*float>(malloc(cast<long>(max_lag + 1) * sizeof(float)));
        Arima.acf(x, n, max_lag, r);
        local phi: *float = cast<*float>(malloc(cast<long>((max_lag + 1) * (max_lag + 1)) * sizeof(float)));
        local w: int = max_lag + 1;
        out[0] = 1.0;
        loop (local k: int = 1; k <= max_lag; k = k + 1) {
            local num: float = r[k];
            local den: float = 1.0;
            loop (local j: int = 1; j < k; j = j + 1) {
                num = num - (phi[((k - 1) * w) + j] * r[k - j]);
                den = den - (phi[((k - 1) * w) + j] * r[j]);
            }
            local pkk: float = den != 0.0 ? num / den : 0.0;
            phi[(k * w) + k] = pkk;
            loop (local j: int = 1; j < k; j = j + 1) {
                phi[(k * w) + j] = phi[((k - 1) * w) + j] - (pkk * phi[((k - 1) * w) + (k - j)]);
            }
            out[k] = pkk;
        }
        free(cast<*void>(r));
        free(cast<*void>(phi));
    }

    frame difference(x: *float, n: int, d: int, out: *float) ret int {
        loop (local i: int = 0; i < n; i = i + 1) {
            out[i] = x[i];
        }
        local m: int = n;
        loop (local k: int = 0; k < d; k = k + 1) {
            loop (local i: int = 0; i < (m - 1); i = i + 1) {
                out[i] = out[i + 1] - out[i];
            }
            m = m - 1;
        }
        return m;
    }

    # Yule-Walker AR(p): solve the Toeplitz system R phi = r.
    frame yuleWalker(x: *float, n: int, p: int) ret ArmaFit {
        local f: ArmaFit = Arima.empty(p, 0, 0, n);
        f.mean = Stats.mean(x, n);
        local r: *float = cast<*float>(malloc(cast<long>(p + 1) * sizeof(float)));
        Arima.acf(x, n, p, r);
        local m: Matrix = Matrix.new(p, p);
        loop (local i: int = 0; i < p; i = i + 1) {
            loop (local j: int = 0; j < p; j = j + 1) {
                local lag: int = i - j;
                m.put(i, j, r[lag < 0 ? -lag : lag]);
            }
        }
        local phi: *float = cast<*float>(malloc(cast<long>(p) * sizeof(float)));
        if (m.solve(r + 1, phi)) {
            local s: float = 1.0;
            loop (local i: int = 0; i < p; i = i + 1) {
                f.phi[i] = phi[i];
                s = s - (phi[i] * r[i + 1]);
            }
            f.sigma2 = Stats.populationVariance(x, n) * s;
        }
        m.destroy();
        free(cast<*void>(r));
        free(cast<*void>(phi));
        Arima.criteria(&f, x, n);
        return f;
    }

    frame empty(p: int, q: int, d: int, n: int) ret ArmaFit {
        local f: ArmaFit;
        f.p = p;
        f.q = q;
        f.d = d;
        f.mean = 0.0;
        loop (local i: int = 0; i < 8; i = i + 1) {
            f.phi[i] = 0.0;
            f.theta[i] = 0.0;
        }
        f.sigma2 = 0.0;
        f.css = 0.0;
        f.aic = 0.0;
        f.bic = 0.0;
        f.n = n;
        return f;
    }

    # Conditional sum of squares of residuals, with residuals written to e.
    frame residuals(f: *ArmaFit, x: *float, n: int, e: *float) ret float {
        local css: float = 0.0;
        loop (local t: int = 0; t < n; t = t + 1) {
            local pred: float = f.mean;
            loop (local i: int = 0; i < f.p; i = i + 1) {
                if ((t - i - 1) >= 0) {
                    pred = pred + (f.phi[i] * (x[t - i - 1] - f.mean));
                }
            }
            loop (local j: int = 0; j < f.q; j = j + 1) {
                if ((t - j - 1) >= 0) {
                    pred = pred + (f.theta[j] * e[t - j - 1]);
                }
            }
            e[t] = x[t] - pred;
            if (t >= f.p) {
                css = css + (e[t] * e[t]);
            }
        }
        return css;
    }

    frame criteria(f: *ArmaFit, x: *float, n: int) {
        local e: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        f.css = Arima.residuals(f, x, n, e);
        local m: float = cast<float>(n - f.p);
        if (f.sigma2 <= 0.0) {
            f.sigma2 = f.css / m;
        }
        local k: float = cast<float>(f.p + f.q + 1);
        local ll: float = -0.5 * m * (Math.log((2.0 * PI * f.css) / m) + 1.0);
        f.aic = (2.0 * k) - (2.0 * ll);
        f.bic = (k * Math.log(m)) - (2.0 * ll);
        free(cast<*void>(e));
    }

    frame fit(x: *float, n: int, p: int, d: int, q: int) ret ArmaFit {
        local y: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        local m: int = Arima.difference(x, n, d, y);
        local start_fit: ArmaFit = Arima.yuleWalker(y, m, p < 1 ? 1 : p);
        local e: *float = cast<*float>(malloc(cast<long>(m) * sizeof(float)));
        local mean: float = Stats.mean(y, m);
        local objective: Lambda<float>(*float) = |params: *float| ret float {
            local f: ArmaFit = Arima.empty(p, q, d, m);
            f.mean = mean;
            loop (local i: int = 0; i < p; i = i + 1) {
                f.phi[i] = params[i];
            }
            loop (local j: int = 0; j < q; j = j + 1) {
                f.theta[j] = params[p + j];
            }
            # Keep the MA part invertible: |theta| < 1 for each coefficient.
            loop (local j: int = 0; j < q; j = j + 1) {
                if (Math.abs(f.theta[j]) >= 0.999) {
                    return 10000000000.0;
                }
            }
            return Arima.residuals(&f, y, m, e);
        };
        local dims: int = p + q;
        local out: ArmaFit = Arima.empty(p, q, d, m);
        out.mean = mean;
        if (dims > 0) {
            local start: float[16];
            loop (local i: int = 0; i < 16; i = i + 1) {
                start[i] = 0.0;
            }
            loop (local i: int = 0; i < p; i = i + 1) {
                start[i] = start_fit.phi[i];
            }
            local res: MinResult = Optimize.nelderMead(objective, &start[0], dims, 0.1, 0.000000000001, 10000);
            loop (local i: int = 0; i < p; i = i + 1) {
                out.phi[i] = res.x[i];
            }
            loop (local j: int = 0; j < q; j = j + 1) {
                out.theta[j] = res.x[p + j];
            }
            res.destroy();
        }
        Arima.criteria(&out, y, m);
        free(cast<*void>(e));
        free(cast<*void>(y));
        return out;
    }

    # Forecasts `steps` values of the original (undifferenced) series.
    frame forecast(f: *ArmaFit, x: *float, n: int, steps: int, out: *float) {
        local y: *float = cast<*float>(malloc(cast<long>(n + steps) * sizeof(float)));
        local m: int = Arima.difference(x, n, f.d, y);
        local e: *float = cast<*float>(malloc(cast<long>(m + steps) * sizeof(float)));
        Arima.residuals(f, y, m, e);
        loop (local h: int = 0; h < steps; h = h + 1) {
            local t: int = m + h;
            local pred: float = f.mean;
            loop (local i: int = 0; i < f.p; i = i + 1) {
                if ((t - i - 1) >= 0) {
                    pred = pred + (f.phi[i] * (y[t - i - 1] - f.mean));
                }
            }
            loop (local j: int = 0; j < f.q; j = j + 1) {
                local lag: int = t - j - 1;
                if ((lag >= 0) && (lag < m)) {
                    pred = pred + (f.theta[j] * e[lag]);
                }
            }
            y[t] = pred;
            e[t] = 0.0;
        }
        # Undo differencing (d = 0, 1 or 2).
        if (f.d == 0) {
            loop (local h: int = 0; h < steps; h = h + 1) {
                out[h] = y[m + h];
            }
        } else if (f.d == 1) {
            local last: float = x[n - 1];
            loop (local h: int = 0; h < steps; h = h + 1) {
                last = last + y[m + h];
                out[h] = last;
            }
        } else {
            local last: float = x[n - 1];
            local slope: float = x[n - 1] - x[n - 2];
            loop (local h: int = 0; h < steps; h = h + 1) {
                slope = slope + y[m + h];
                last = last + slope;
                out[h] = last;
            }
        }
        free(cast<*void>(y));
        free(cast<*void>(e));
    }

    # Simulates an ARMA process (for tests and the demo endpoint).
    frame simulate(phi: *float, p: int, theta: *float, q: int, sigma: float, n: int, normals: *float, out: *float) {
        loop (local t: int = 0; t < n; t = t + 1) {
            local v: float = sigma * normals[t];
            loop (local i: int = 0; i < p; i = i + 1) {
                if ((t - i - 1) >= 0) {
                    v = v + (phi[i] * out[t - i - 1]);
                }
            }
            loop (local j: int = 0; j < q; j = j + 1) {
                if ((t - j - 1) >= 0) {
                    v = v + (theta[j] * sigma * normals[t - j - 1]);
                }
            }
            out[t] = v;
        }
    }

    # Augmented Dickey-Fuller with a constant: regress dy_t on y_{t-1}, lagged dy.
    frame adf(x: *float, n: int, lags: int) ret UnitRoot {
        local rows: int = n - lags - 1;
        local cols: int = 2 + lags;
        local design: Matrix = Matrix.new(rows, cols);
        local target: *float = cast<*float>(malloc(cast<long>(rows) * sizeof(float)));
        loop (local r: int = 0; r < rows; r = r + 1) {
            local t: int = r + lags + 1;
            target[r] = x[t] - x[t - 1];
            design.put(r, 0, 1.0);
            design.put(r, 1, x[t - 1]);
            loop (local k: int = 1; k <= lags; k = k + 1) {
                design.put(r, 1 + k, x[t - k] - x[t - k - 1]);
            }
        }
        local beta: *float = cast<*float>(malloc(cast<long>(cols) * sizeof(float)));
        design.leastSquares(target, beta);
        # Standard error of the y_{t-1} coefficient from (X'X)^{-1} s^2.
        local sse: float = 0.0;
        loop (local r: int = 0; r < rows; r = r + 1) {
            local fit: float = 0.0;
            loop (local c: int = 0; c < cols; c = c + 1) {
                fit = fit + (design.at(r, c) * beta[c]);
            }
            local e: float = target[r] - fit;
            sse = sse + (e * e);
        }
        local s2: float = sse / cast<float>(rows - cols);
        local xt: Matrix = design.transpose();
        local xtx: Matrix = xt.mul(&design);
        local inv: Matrix;
        local stat: float = 0.0;
        if (xtx.inverse(&inv)) {
            stat = beta[1] / Math.sqrt(s2 * inv.at(1, 1));
            inv.destroy();
        }
        local u: UnitRoot = UnitRoot { statistic: stat, lags: lags, critical_1: -3.43, critical_5: -2.86, critical_10: -2.57, reject_5: stat < -2.86 };
        design.destroy();
        xt.destroy();
        xtx.destroy();
        free(cast<*void>(target));
        free(cast<*void>(beta));
        return u;
    }

    # KPSS level-stationarity statistic with a Bartlett long-run variance.
    frame kpss(x: *float, n: int, lags: int) ret UnitRoot {
        local mean: float = Stats.mean(x, n);
        local s: float = 0.0;
        local sum_sq: float = 0.0;
        loop (local t: int = 0; t < n; t = t + 1) {
            s = s + (x[t] - mean);
            sum_sq = sum_sq + (s * s);
        }
        local gamma0: float = 0.0;
        loop (local t: int = 0; t < n; t = t + 1) {
            gamma0 = gamma0 + ((x[t] - mean) * (x[t] - mean));
        }
        gamma0 = gamma0 / cast<float>(n);
        local lrv: float = gamma0;
        loop (local k: int = 1; k <= lags; k = k + 1) {
            local g: float = 0.0;
            loop (local t: int = k; t < n; t = t + 1) {
                g = g + ((x[t] - mean) * (x[t - k] - mean));
            }
            g = g / cast<float>(n);
            lrv = lrv + (2.0 * (1.0 - (cast<float>(k) / cast<float>(lags + 1))) * g);
        }
        local nf: float = cast<float>(n);
        local stat: float = sum_sq / (nf * nf * lrv);
        return UnitRoot { statistic: stat, lags: lags, critical_1: 0.739, critical_5: 0.463, critical_10: 0.347, reject_5: stat > 0.463 };
    }

    # Order selection by AIC over p, q in [0, max_p] x [0, max_q].
    frame selectOrder(x: *float, n: int, d: int, max_p: int, max_q: int, best_p: *int, best_q: *int) ret float {
        local best: float = 1000000000000.0;
        loop (local p: int = 0; p <= max_p; p = p + 1) {
            loop (local q: int = 0; q <= max_q; q = q + 1) {
                if ((p == 0) && (q == 0)) {
                    continue;
                }
                local f: ArmaFit = Arima.fit(x, n, p, d, q);
                if (f.aic < best) {
                    best = f.aic;
                    *best_p = p;
                    *best_q = q;
                }
            }
        }
        return best;
    }
}
