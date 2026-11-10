# Portfolio construction.
#
# Closed-form mean-variance solutions (global minimum variance, target-return
# frontier, tangency portfolio) via the KKT system, a long-only solver using
# projected gradient descent onto the simplex, risk parity by cyclical
# coordinate updates, and an efficient-frontier sweep.

import malloc, free from "std/c.bpl";
import [Math] from "std/math.bpl";
import [Matrix] from "../math/matrix.bpl";
import [Sort] from "../math/sort.bpl";

export [Portfolio];
export [Allocation];
export [Frontier];

struct Allocation {
    weights: *float,
    n: int,
    expected_return: float,
    volatility: float,
    sharpe: float,
    ok: bool,
    iterations: int,

    frame empty(n: int) ret Allocation {
        local a: Allocation;
        a.n = n;
        a.weights = cast<*float>(malloc(cast<long>(n + 1) * sizeof(float)));
        loop (local i: int = 0; i < n; i = i + 1) {
            a.weights[i] = 0.0;
        }
        a.expected_return = 0.0;
        a.volatility = 0.0;
        a.sharpe = 0.0;
        a.ok = false;
        a.iterations = 0;
        return a;
    }

    frame destroy(this: *Allocation) {
        if (this.weights != nullptr) {
            free(cast<*void>(this.weights));
            this.weights = nullptr;
        }
    }

    frame evaluate(this: *Allocation, mu: *float, cov: *Matrix, risk_free: float) {
        local r: float = 0.0;
        loop (local i: int = 0; i < this.n; i = i + 1) {
            r = r + (this.weights[i] * mu[i]);
        }
        this.expected_return = r;
        local v: float = cov.quadForm(this.weights);
        this.volatility = v > 0.0 ? Math.sqrt(v) : 0.0;
        this.sharpe = this.volatility > 0.0 ? (r - risk_free) / this.volatility : 0.0;
    }

    frame weightSum(this: *Allocation) ret float {
        local s: float = 0.0;
        loop (local i: int = 0; i < this.n; i = i + 1) {
            s = s + this.weights[i];
        }
        return s;
    }

    frame minWeight(this: *Allocation) ret float {
        local m: float = this.weights[0];
        loop (local i: int = 1; i < this.n; i = i + 1) {
            m = Math.min(m, this.weights[i]);
        }
        return m;
    }
}

struct Frontier {
    returns: *float,
    vols: *float,
    points: int,

    frame destroy(this: *Frontier) {
        free(cast<*void>(this.returns));
        free(cast<*void>(this.vols));
    }
}

struct Portfolio {
    # Global minimum-variance weights: w = S^-1 1 / (1' S^-1 1).
    frame minVariance(mu: *float, cov: *Matrix, risk_free: float) ret Allocation {
        local n: int = cov.rows;
        local a: Allocation = Allocation.empty(n);
        local ones: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        loop (local i: int = 0; i < n; i = i + 1) {
            ones[i] = 1.0;
        }
        if (!cov.solve(ones, a.weights)) {
            free(cast<*void>(ones));
            return a;
        }
        local s: float = a.weightSum();
        loop (local i: int = 0; i < n; i = i + 1) {
            a.weights[i] = a.weights[i] / s;
        }
        a.ok = true;
        a.evaluate(mu, cov, risk_free);
        free(cast<*void>(ones));
        return a;
    }

    # Tangency (max Sharpe) portfolio: w ∝ S^-1 (mu - rf).
    frame maxSharpe(mu: *float, cov: *Matrix, risk_free: float) ret Allocation {
        local n: int = cov.rows;
        local a: Allocation = Allocation.empty(n);
        local excess: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        loop (local i: int = 0; i < n; i = i + 1) {
            excess[i] = mu[i] - risk_free;
        }
        if (!cov.solve(excess, a.weights)) {
            free(cast<*void>(excess));
            return a;
        }
        local s: float = a.weightSum();
        if (Math.abs(s) < 0.000000000001) {
            free(cast<*void>(excess));
            return a;
        }
        loop (local i: int = 0; i < n; i = i + 1) {
            a.weights[i] = a.weights[i] / s;
        }
        a.ok = true;
        a.evaluate(mu, cov, risk_free);
        free(cast<*void>(excess));
        return a;
    }

    # Minimum variance for a target return (short sales allowed), via the
    # two-fund theorem with A = 1'S^-1 1, B = 1'S^-1 mu, C = mu'S^-1 mu.
    frame targetReturn(mu: *float, cov: *Matrix, target: float, risk_free: float) ret Allocation {
        local n: int = cov.rows;
        local a: Allocation = Allocation.empty(n);
        local ones: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        local s1: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        local smu: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        loop (local i: int = 0; i < n; i = i + 1) {
            ones[i] = 1.0;
        }
        local ok: bool = cov.solve(ones, s1) && cov.solve(mu, smu);
        if (ok) {
            local aa: float = 0.0;
            local bb: float = 0.0;
            local cc: float = 0.0;
            loop (local i: int = 0; i < n; i = i + 1) {
                aa = aa + s1[i];
                bb = bb + smu[i];
                cc = cc + (mu[i] * smu[i]);
            }
            local d: float = (aa * cc) - (bb * bb);
            if (Math.abs(d) > 0.000000000001) {
                local lambda: float = (cc - (bb * target)) / d;
                local gamma: float = ((aa * target) - bb) / d;
                loop (local i: int = 0; i < n; i = i + 1) {
                    a.weights[i] = (lambda * s1[i]) + (gamma * smu[i]);
                }
                a.ok = true;
                a.evaluate(mu, cov, risk_free);
            }
        }
        free(cast<*void>(ones));
        free(cast<*void>(s1));
        free(cast<*void>(smu));
        return a;
    }

    # Euclidean projection onto {w >= 0, sum w = 1} (Duchi et al.).
    frame projectSimplex(v: *float, n: int, out: *float) {
        local u: *float = Sort.copySorted(v, n);
        local css: float = 0.0;
        local rho: int = -1;
        local theta: float = 0.0;
        local j: int = n - 1;
        local k: int = 1;
        loop (j >= 0) {
            css = css + u[j];
            local t: float = (css - 1.0) / cast<float>(k);
            if ((u[j] - t) > 0.0) {
                rho = k;
                theta = t;
            }
            j = j - 1;
            k = k + 1;
        }
        if (rho < 0) {
            theta = 0.0;
        }
        loop (local i: int = 0; i < n; i = i + 1) {
            local w: float = v[i] - theta;
            out[i] = w > 0.0 ? w : 0.0;
        }
        free(cast<*void>(u));
    }

    # Long-only mean-variance: maximize mu'w - (risk_aversion/2) w'Sw on the simplex.
    frame longOnly(mu: *float, cov: *Matrix, risk_aversion: float, risk_free: float, max_iter: int) ret Allocation {
        local n: int = cov.rows;
        local a: Allocation = Allocation.empty(n);
        local grad: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        local step_v: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        local next: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        loop (local i: int = 0; i < n; i = i + 1) {
            a.weights[i] = 1.0 / cast<float>(n);
        }
        # Step size from the largest eigenvalue bound (Gershgorin).
        local bound: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            local row: float = 0.0;
            loop (local j: int = 0; j < n; j = j + 1) {
                row = row + Math.abs(cov.at(i, j));
            }
            bound = Math.max(bound, row);
        }
        local step: float = 1.0 / ((risk_aversion * bound) + 0.000000001);
        local it: int = 0;
        loop (it < max_iter) {
            cov.mulVec(a.weights, grad);
            loop (local i: int = 0; i < n; i = i + 1) {
                step_v[i] = a.weights[i] + (step * (mu[i] - (risk_aversion * grad[i])));
            }
            Portfolio.projectSimplex(step_v, n, next);
            local change: float = 0.0;
            loop (local i: int = 0; i < n; i = i + 1) {
                change = change + Math.abs(next[i] - a.weights[i]);
                a.weights[i] = next[i];
            }
            it = it + 1;
            if (change < 0.000000000001) {
                break;
            }
        }
        a.iterations = it;
        a.ok = true;
        a.evaluate(mu, cov, risk_free);
        free(cast<*void>(grad));
        free(cast<*void>(step_v));
        free(cast<*void>(next));
        return a;
    }

    # Equal risk contribution weights (long-only).
    frame riskParity(mu: *float, cov: *Matrix, risk_free: float, max_iter: int) ret Allocation {
        local n: int = cov.rows;
        local a: Allocation = Allocation.empty(n);
        loop (local i: int = 0; i < n; i = i + 1) {
            a.weights[i] = 1.0 / Math.sqrt(cov.at(i, i));
        }
        local target: float = 1.0 / cast<float>(n);
        local sw: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        local it: int = 0;
        loop (it < max_iter) {
            # Newton-like fixed point: w_i <- w_i * (target / rc_i)^0.5.
            cov.mulVec(a.weights, sw);
            local total: float = 0.0;
            loop (local i: int = 0; i < n; i = i + 1) {
                total = total + (a.weights[i] * sw[i]);
            }
            local worst: float = 0.0;
            loop (local i: int = 0; i < n; i = i + 1) {
                local rc: float = (a.weights[i] * sw[i]) / total;
                worst = Math.max(worst, Math.abs(rc - target));
                a.weights[i] = a.weights[i] * Math.sqrt(target / rc);
            }
            local s: float = a.weightSum();
            loop (local i: int = 0; i < n; i = i + 1) {
                a.weights[i] = a.weights[i] / s;
            }
            it = it + 1;
            if (worst < 0.0000000001) {
                break;
            }
        }
        a.iterations = it;
        a.ok = true;
        a.evaluate(mu, cov, risk_free);
        free(cast<*void>(sw));
        return a;
    }

    # Fractional risk contribution of each asset (sums to 1).
    frame riskContributions(weights: *float, cov: *Matrix, out: *float) {
        local n: int = cov.rows;
        local sw: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        cov.mulVec(weights, sw);
        local total: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            total = total + (weights[i] * sw[i]);
        }
        loop (local i: int = 0; i < n; i = i + 1) {
            out[i] = total > 0.0 ? (weights[i] * sw[i]) / total : 0.0;
        }
        free(cast<*void>(sw));
    }

    # Inverse-volatility weights.
    frame inverseVol(mu: *float, cov: *Matrix, risk_free: float) ret Allocation {
        local n: int = cov.rows;
        local a: Allocation = Allocation.empty(n);
        local s: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            a.weights[i] = 1.0 / Math.sqrt(cov.at(i, i));
            s = s + a.weights[i];
        }
        loop (local i: int = 0; i < n; i = i + 1) {
            a.weights[i] = a.weights[i] / s;
        }
        a.ok = true;
        a.evaluate(mu, cov, risk_free);
        return a;
    }

    frame equalWeight(mu: *float, cov: *Matrix, risk_free: float) ret Allocation {
        local n: int = cov.rows;
        local a: Allocation = Allocation.empty(n);
        loop (local i: int = 0; i < n; i = i + 1) {
            a.weights[i] = 1.0 / cast<float>(n);
        }
        a.ok = true;
        a.evaluate(mu, cov, risk_free);
        return a;
    }

    # Efficient frontier between the GMV return and the max asset return.
    frame frontier(mu: *float, cov: *Matrix, points: int) ret Frontier {
        local f: Frontier;
        f.points = points;
        f.returns = cast<*float>(malloc(cast<long>(points) * sizeof(float)));
        f.vols = cast<*float>(malloc(cast<long>(points) * sizeof(float)));
        local gmv: Allocation = Portfolio.minVariance(mu, cov, 0.0);
        local hi: float = mu[0];
        loop (local i: int = 1; i < cov.rows; i = i + 1) {
            hi = Math.max(hi, mu[i]);
        }
        local lo: float = gmv.expected_return;
        loop (local k: int = 0; k < points; k = k + 1) {
            local target: float = lo + (((hi - lo) * cast<float>(k)) / cast<float>(points - 1));
            local a: Allocation = Portfolio.targetReturn(mu, cov, target, 0.0);
            f.returns[k] = a.expected_return;
            f.vols[k] = a.volatility;
            a.destroy();
        }
        gmv.destroy();
        return f;
    }

    # Black-Litterman posterior expected returns with a single set of absolute
    # views (P = I restricted to `view_assets`), confidence tau.
    frame blackLitterman(cov: *Matrix, market_weights: *float, risk_aversion: float, tau: float, views: *float, view_mask: *bool, view_var: float, out: *float) ret bool {
        local n: int = cov.rows;
        # Equilibrium returns pi = delta S w.
        local pi: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        cov.mulVec(market_weights, pi);
        loop (local i: int = 0; i < n; i = i + 1) {
            pi[i] = pi[i] * risk_aversion;
        }
        # Posterior precision M = (tau S)^-1 + P' O^-1 P, rhs = (tau S)^-1 pi + P' O^-1 q.
        local ts: Matrix = cov.scaled(tau);
        local tsi: Matrix;
        if (!ts.inverse(&tsi)) {
            ts.destroy();
            free(cast<*void>(pi));
            return false;
        }
        local m: Matrix = tsi.copy();
        local rhs: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        tsi.mulVec(pi, rhs);
        loop (local i: int = 0; i < n; i = i + 1) {
            if (view_mask[i]) {
                m.addAt(i, i, 1.0 / view_var);
                rhs[i] = rhs[i] + (views[i] / view_var);
            }
        }
        local ok: bool = m.solve(rhs, out);
        ts.destroy();
        tsi.destroy();
        m.destroy();
        free(cast<*void>(rhs));
        free(cast<*void>(pi));
        return ok;
    }

    # Tracking error of weights w against benchmark b.
    frame trackingError(w: *float, b: *float, cov: *Matrix) ret float {
        local n: int = cov.rows;
        local d: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        loop (local i: int = 0; i < n; i = i + 1) {
            d[i] = w[i] - b[i];
        }
        local v: float = cov.quadForm(d);
        free(cast<*void>(d));
        return v > 0.0 ? Math.sqrt(v) : 0.0;
    }

    # Diversification ratio: weighted average vol / portfolio vol.
    frame diversificationRatio(w: *float, cov: *Matrix) ret float {
        local n: int = cov.rows;
        local num: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            num = num + (Math.abs(w[i]) * Math.sqrt(cov.at(i, i)));
        }
        local v: float = cov.quadForm(w);
        return v > 0.0 ? num / Math.sqrt(v) : 0.0;
    }
}
