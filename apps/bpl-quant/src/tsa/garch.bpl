# Conditional volatility models fitted by maximum likelihood.
#
# GARCH(1,1), GJR-GARCH(1,1) (leverage) and EGARCH(1,1) with Gaussian
# innovations; GARCH and GJR use variance targeting. Parameters are mapped to unconstrained space so Nelder-Mead
# can search freely while stationarity and positivity hold by construction.

import malloc, free from "std/c.bpl";
import [Math], PI from "std/math.bpl";
import [Optimize], [MinResult] from "../math/optimize.bpl";
import [Stats] from "../math/stats.bpl";
import [Xoshiro] from "../core/prng.bpl";

export [Garch];
export [GarchKind];
export [GarchFit];

enum GarchKind {
    Garch,
    Gjr,
    Egarch,
}

struct GarchFit {
    kind: GarchKind,
    mu: float,
    omega: float,
    alpha: float,
    beta: float,
    gamma: float,
    log_likelihood: float,
    aic: float,
    bic: float,
    persistence: float,
    long_run_vol: float,
    iterations: int,
    converged: bool,
}

struct Garch {
    frame logistic(x: float) ret float {
        return 1.0 / (1.0 + Math.exp(-x));
    }

    # tanh: maps R to (-1, 1) for the EGARCH persistence parameter.
    frame squash(x: float) ret float {
        if (x > 20.0) {
            return 1.0;
        }
        if (x < -20.0) {
            return -1.0;
        }
        local e: float = Math.exp(2.0 * x);
        return (e - 1.0) / (e + 1.0);
    }

    frame logit(p: float) ret float {
        return Math.log(p / (1.0 - p));
    }

    # Conditional variances for returns r under fit f, written to out (n values).
    frame variances(f: *GarchFit, r: *float, n: int, out: *float) {
        local sample: float = Stats.populationVariance(r, n);
        local h: float = sample;
        local log_h: float = Math.log(sample);
        loop (local t: int = 0; t < n; t = t + 1) {
            if (t > 0) {
                local e: float = r[t - 1] - f.mu;
                if (f.kind == GarchKind.Garch) {
                    h = f.omega + (f.alpha * e * e) + (f.beta * h);
                } else if (f.kind == GarchKind.Gjr) {
                    local lev: float = e < 0.0 ? f.gamma : 0.0;
                    h = f.omega + ((f.alpha + lev) * e * e) + (f.beta * h);
                } else {
                    local z: float = e / Math.sqrt(h);
                    log_h = f.omega + (f.beta * log_h) + (f.alpha * (Math.abs(z) - Math.sqrt(2.0 / PI))) + (f.gamma * z);
                    h = Math.exp(log_h);
                }
            }
            out[t] = h;
        }
    }

    frame negLogLikelihood(f: *GarchFit, r: *float, n: int, h: *float) ret float {
        Garch.variances(f, r, n, h);
        local ll: float = 0.0;
        loop (local t: int = 0; t < n; t = t + 1) {
            if (!(h[t] > 0.0) || (h[t] != h[t])) {
                return 10000000000.0;
            }
            local e: float = r[t] - f.mu;
            ll = ll - (0.5 * (Math.log(2.0 * PI) + Math.log(h[t]) + ((e * e) / h[t])));
        }
        return -ll;
    }

    # Unconstrained parameters -> model parameters.
    frame decode(kind: GarchKind, p: *float, sample_var: float, out: *GarchFit) {
        out.kind = kind;
        out.mu = p[0];
        if (kind == GarchKind.Egarch) {
            out.omega = p[1];
            out.alpha = p[2];
            out.beta = 0.999 * Garch.squash(p[3]);
            out.gamma = p[4];
            return;
        }
        # persistence = alpha + beta (+ gamma/2) in (0, 1); split by a second logistic.
        local persistence: float = 0.9999 * Garch.logistic(p[1]);
        local share: float = Garch.logistic(p[2]);
        local lev: float = kind == GarchKind.Gjr ? Garch.logistic(p[3]) : 0.0;
        local a_total: float = persistence * share;
        out.beta = persistence - a_total;
        out.gamma = kind == GarchKind.Gjr ? 2.0 * a_total * lev : 0.0;
        out.alpha = a_total - (out.gamma / 2.0);
        # Variance targeting: the unconditional variance equals the sample
        # variance, which keeps homoskedastic data from degenerating to
        # omega -> 0, beta -> 1.
        out.omega = sample_var * (1.0 - persistence);
    }

    frame fit(kind: GarchKind, r: *float, n: int) ret GarchFit {
        local sample_var: float = Stats.populationVariance(r, n);
        local mean: float = Stats.mean(r, n);
        local h: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        local objective: Lambda<float>(*float) = |p: *float| ret float {
            local f: GarchFit;
            Garch.decode(kind, p, sample_var, &f);
            return Garch.negLogLikelihood(&f, r, n, h);
        };
        local dims: int = kind == GarchKind.Garch ? 3 : (kind == GarchKind.Gjr ? 4 : 5);
        local start: float[5] = [mean, Garch.logit(0.95), Garch.logit(0.08 / 0.95), 0.0, 0.0];
        if (kind == GarchKind.Egarch) {
            start[1] = Math.log(sample_var) * 0.05;
            start[2] = 0.1;
            start[3] = 2.0;
            start[4] = 0.0;
        }
        local res: MinResult = Optimize.nelderMead(objective, &start[0], dims, 0.25, 0.0000000001, 4000);
        # Restart from the best point to escape a degenerate simplex.
        local res2: MinResult = Optimize.nelderMead(objective, res.x, dims, 0.05, 0.0000000001, 4000);
        local out: GarchFit;
        Garch.decode(kind, res2.x, sample_var, &out);
        out.log_likelihood = -res2.fx;
        out.iterations = res.iterations + res2.iterations;
        out.converged = res2.converged;
        local k: float = cast<float>(dims);
        out.aic = (2.0 * k) - (2.0 * out.log_likelihood);
        out.bic = (k * Math.log(cast<float>(n))) - (2.0 * out.log_likelihood);
        if (kind == GarchKind.Egarch) {
            out.persistence = out.beta;
            out.long_run_vol = Math.sqrt(Math.exp(out.omega / (1.0 - out.beta)));
        } else {
            out.persistence = out.alpha + out.beta + (out.gamma / 2.0);
            out.long_run_vol = out.persistence < 1.0 ? Math.sqrt(out.omega / (1.0 - out.persistence)) : 0.0 / 0.0;
        }
        res.destroy();
        res2.destroy();
        free(cast<*void>(h));
        return out;
    }

    # h-step-ahead variance forecasts after the sample (GARCH/GJR closed form).
    frame forecast(f: *GarchFit, r: *float, n: int, steps: int, out: *float) {
        local h: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        Garch.variances(f, r, n, h);
        local e: float = r[n - 1] - f.mu;
        local next: float = 0.0;
        if (f.kind == GarchKind.Egarch) {
            local z: float = e / Math.sqrt(h[n - 1]);
            local log_h: float = f.omega + (f.beta * Math.log(h[n - 1])) + (f.alpha * (Math.abs(z) - Math.sqrt(2.0 / PI))) + (f.gamma * z);
            loop (local k: int = 0; k < steps; k = k + 1) {
                out[k] = Math.exp(log_h);
                log_h = f.omega + (f.beta * log_h);
            }
            free(cast<*void>(h));
            return;
        }
        local lev: float = (f.kind == GarchKind.Gjr) && (e < 0.0) ? f.gamma : 0.0;
        next = f.omega + ((f.alpha + lev) * e * e) + (f.beta * h[n - 1]);
        local long_run: float = f.persistence < 1.0 ? f.omega / (1.0 - f.persistence) : next;
        loop (local k: int = 0; k < steps; k = k + 1) {
            out[k] = long_run + (Math.pow(f.persistence, cast<float>(k)) * (next - long_run));
        }
        free(cast<*void>(h));
    }

    # Simulates n returns from a fitted (or chosen) GARCH/GJR process.
    frame simulate(f: *GarchFit, n: int, seed: u64, out: *float) {
        local rng: Xoshiro = Xoshiro.new(seed);
        local h: float = f.persistence < 1.0 ? f.omega / (1.0 - f.persistence) : f.omega;
        local log_h: float = Math.log(h);
        local e: float = 0.0;
        loop (local t: int = 0; t < n; t = t + 1) {
            if (t > 0) {
                if (f.kind == GarchKind.Egarch) {
                    local z: float = e / Math.sqrt(h);
                    log_h = f.omega + (f.beta * log_h) + (f.alpha * (Math.abs(z) - Math.sqrt(2.0 / PI))) + (f.gamma * z);
                    h = Math.exp(log_h);
                } else {
                    local lev: float = (f.kind == GarchKind.Gjr) && (e < 0.0) ? f.gamma : 0.0;
                    h = f.omega + ((f.alpha + lev) * e * e) + (f.beta * h);
                }
            }
            e = Math.sqrt(h) * rng.normal();
            out[t] = f.mu + e;
        }
    }
}
