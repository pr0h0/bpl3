# Covariance estimators for a panel of asset returns.
#
# A ReturnPanel stores T observations of N assets column-major (one column per
# asset). Estimators: sample covariance, EWMA (RiskMetrics), Ledoit-Wolf
# shrinkage toward a scaled identity, and correlation conversion.

import malloc, free from "std/c.bpl";
import [Math] from "std/math.bpl";
import [Matrix] from "../math/matrix.bpl";
import [Xoshiro] from "../core/prng.bpl";

export [ReturnPanel];
export [Covariance];

struct ReturnPanel {
    data: *float,
    assets: int,
    periods: int,

    frame new(assets: int, periods: int) ret ReturnPanel {
        local p: ReturnPanel;
        p.assets = assets;
        p.periods = periods;
        p.data = cast<*float>(malloc((cast<long>(assets) * cast<long>(periods) * sizeof(float)) + 8));
        return p;
    }

    frame destroy(this: *ReturnPanel) {
        if (this.data != nullptr) {
            free(cast<*void>(this.data));
            this.data = nullptr;
        }
    }

    frame column(this: *ReturnPanel, asset: int) ret *float {
        return this.data + (asset * this.periods);
    }

    frame at(this: *ReturnPanel, asset: int, t: int) ret float {
        return this.data[(asset * this.periods) + t];
    }

    frame put(this: *ReturnPanel, asset: int, t: int, v: float) {
        this.data[(asset * this.periods) + t] = v;
    }

    frame mean(this: *ReturnPanel, asset: int) ret float {
        local col: *float = this.column(asset);
        local s: float = 0.0;
        loop (local t: int = 0; t < this.periods; t = t + 1) {
            s = s + col[t];
        }
        return s / cast<float>(this.periods);
    }

    # Simulates correlated normal returns: r = mu + L z with L = chol(cov).
    frame simulate(mu: *float, cov: *Matrix, periods: int, seed: u64) ret ReturnPanel {
        local n: int = cov.rows;
        local p: ReturnPanel = ReturnPanel.new(n, periods);
        local l: Matrix;
        if (!cov.cholesky(&l)) {
            l.destroy();
            throw "simulate: covariance is not positive definite";
        }
        local rng: Xoshiro = Xoshiro.new(seed);
        local z: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        loop (local t: int = 0; t < periods; t = t + 1) {
            loop (local i: int = 0; i < n; i = i + 1) {
                z[i] = rng.normal();
            }
            loop (local i: int = 0; i < n; i = i + 1) {
                local v: float = mu[i];
                loop (local j: int = 0; j <= i; j = j + 1) {
                    v = v + (l.at(i, j) * z[j]);
                }
                p.put(i, t, v);
            }
        }
        free(cast<*void>(z));
        l.destroy();
        return p;
    }

    # Portfolio return series for weights w.
    frame portfolioReturns(this: *ReturnPanel, w: *float, out: *float) {
        loop (local t: int = 0; t < this.periods; t = t + 1) {
            local r: float = 0.0;
            loop (local i: int = 0; i < this.assets; i = i + 1) {
                r = r + (w[i] * this.at(i, t));
            }
            out[t] = r;
        }
    }
}

struct Covariance {
    frame sample(p: *ReturnPanel) ret Matrix {
        local n: int = p.assets;
        local t: int = p.periods;
        local m: Matrix = Matrix.new(n, n);
        local means: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        loop (local i: int = 0; i < n; i = i + 1) {
            means[i] = p.mean(i);
        }
        loop (local i: int = 0; i < n; i = i + 1) {
            local ci: *float = p.column(i);
            loop (local j: int = i; j < n; j = j + 1) {
                local cj: *float = p.column(j);
                local s: float = 0.0;
                loop (local k: int = 0; k < t; k = k + 1) {
                    s = s + ((ci[k] - means[i]) * (cj[k] - means[j]));
                }
                local v: float = s / cast<float>(t - 1);
                m.put(i, j, v);
                m.put(j, i, v);
            }
        }
        free(cast<*void>(means));
        return m;
    }

    # RiskMetrics EWMA covariance (zero-mean), most recent observation last.
    frame ewma(p: *ReturnPanel, lambda: float) ret Matrix {
        local n: int = p.assets;
        local m: Matrix = Matrix.new(n, n);
        local weight: float = 1.0;
        local total: float = 0.0;
        local k: int = p.periods - 1;
        loop (k >= 0) {
            loop (local i: int = 0; i < n; i = i + 1) {
                local ri: float = p.at(i, k);
                loop (local j: int = i; j < n; j = j + 1) {
                    m.addAt(i, j, weight * ri * p.at(j, k));
                }
            }
            total = total + weight;
            weight = weight * lambda;
            k = k - 1;
        }
        loop (local i: int = 0; i < n; i = i + 1) {
            loop (local j: int = i; j < n; j = j + 1) {
                local v: float = m.at(i, j) / total;
                m.put(i, j, v);
                m.put(j, i, v);
            }
        }
        return m;
    }

    # Ledoit-Wolf shrinkage toward mu * I; returns the shrinkage intensity in *delta_out.
    frame ledoitWolf(p: *ReturnPanel, delta_out: *float) ret Matrix {
        local n: int = p.assets;
        local t: int = p.periods;
        local s: Matrix = Covariance.sample(p);
        local mu: float = s.trace() / cast<float>(n);
        # d2 = ||S - mu I||^2 / n
        local d2: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            loop (local j: int = 0; j < n; j = j + 1) {
                local target: float = i == j ? mu : 0.0;
                local diff: float = s.at(i, j) - target;
                d2 = d2 + (diff * diff);
            }
        }
        d2 = d2 / cast<float>(n);
        # b2 = average squared distance of x x' from S.
        local means: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        loop (local i: int = 0; i < n; i = i + 1) {
            means[i] = p.mean(i);
        }
        local b2: float = 0.0;
        loop (local k: int = 0; k < t; k = k + 1) {
            local acc: float = 0.0;
            loop (local i: int = 0; i < n; i = i + 1) {
                local xi: float = p.at(i, k) - means[i];
                loop (local j: int = 0; j < n; j = j + 1) {
                    local xj: float = p.at(j, k) - means[j];
                    local diff: float = (xi * xj) - s.at(i, j);
                    acc = acc + (diff * diff);
                }
            }
            b2 = b2 + (acc / cast<float>(n));
        }
        b2 = b2 / (cast<float>(t) * cast<float>(t));
        if (b2 > d2) {
            b2 = d2;
        }
        local delta: float = d2 > 0.0 ? b2 / d2 : 0.0;
        local out: Matrix = Matrix.new(n, n);
        loop (local i: int = 0; i < n; i = i + 1) {
            loop (local j: int = 0; j < n; j = j + 1) {
                local target: float = i == j ? mu : 0.0;
                out.put(i, j, (delta * target) + ((1.0 - delta) * s.at(i, j)));
            }
        }
        free(cast<*void>(means));
        s.destroy();
        *delta_out = delta;
        return out;
    }

    frame toCorrelation(cov: *Matrix) ret Matrix {
        local n: int = cov.rows;
        local out: Matrix = Matrix.new(n, n);
        loop (local i: int = 0; i < n; i = i + 1) {
            loop (local j: int = 0; j < n; j = j + 1) {
                local d: float = Math.sqrt(cov.at(i, i) * cov.at(j, j));
                out.put(i, j, d > 0.0 ? cov.at(i, j) / d : 0.0);
            }
        }
        return out;
    }

    frame fromCorrelation(corr: *Matrix, vols: *float) ret Matrix {
        local n: int = corr.rows;
        local out: Matrix = Matrix.new(n, n);
        loop (local i: int = 0; i < n; i = i + 1) {
            loop (local j: int = 0; j < n; j = j + 1) {
                out.put(i, j, corr.at(i, j) * vols[i] * vols[j]);
            }
        }
        return out;
    }

    # Average pairwise correlation (off-diagonal mean).
    frame averageCorrelation(corr: *Matrix) ret float {
        local n: int = corr.rows;
        if (n < 2) {
            return 0.0;
        }
        local s: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            loop (local j: int = i + 1; j < n; j = j + 1) {
                s = s + corr.at(i, j);
            }
        }
        return s / (cast<float>(n * (n - 1)) / 2.0);
    }

    # Single-factor (market) model covariance: beta beta' var_m + diag(resid).
    frame singleIndex(p: *ReturnPanel, market: *float) ret Matrix {
        local n: int = p.assets;
        local t: int = p.periods;
        local mm: float = 0.0;
        loop (local k: int = 0; k < t; k = k + 1) {
            mm = mm + market[k];
        }
        mm = mm / cast<float>(t);
        local vm: float = 0.0;
        loop (local k: int = 0; k < t; k = k + 1) {
            vm = vm + ((market[k] - mm) * (market[k] - mm));
        }
        vm = vm / cast<float>(t - 1);
        local beta: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        local resid: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        loop (local i: int = 0; i < n; i = i + 1) {
            local mi: float = p.mean(i);
            local cov: float = 0.0;
            loop (local k: int = 0; k < t; k = k + 1) {
                cov = cov + ((p.at(i, k) - mi) * (market[k] - mm));
            }
            cov = cov / cast<float>(t - 1);
            beta[i] = vm > 0.0 ? cov / vm : 0.0;
            local alpha: float = mi - (beta[i] * mm);
            local rv: float = 0.0;
            loop (local k: int = 0; k < t; k = k + 1) {
                local e: float = p.at(i, k) - alpha - (beta[i] * market[k]);
                rv = rv + (e * e);
            }
            resid[i] = rv / cast<float>(t - 2);
        }
        local out: Matrix = Matrix.new(n, n);
        loop (local i: int = 0; i < n; i = i + 1) {
            loop (local j: int = 0; j < n; j = j + 1) {
                local v: float = beta[i] * beta[j] * vm;
                if (i == j) {
                    v = v + resid[i];
                }
                out.put(i, j, v);
            }
        }
        free(cast<*void>(beta));
        free(cast<*void>(resid));
        return out;
    }
}
