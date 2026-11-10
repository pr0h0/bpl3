# Gaussian hidden Markov model for market regimes.
#
# K states (2-4), each emitting N(mu_k, sigma_k^2) returns, with a K x K
# transition matrix. Baum-Welch (EM) fits the parameters using the scaled
# forward-backward recursions, so long series do not underflow. Viterbi
# gives the most likely state path; smoothed posteriors give per-bar state
# probabilities. States are sorted by volatility after fitting (state 0 =
# calmest) so results are comparable across runs.

import malloc, free from "std/c.bpl";
import [Math] from "std/math.bpl";

export [Hmm];
export [HmmFit];

global const MAX_STATES: int = 4;

struct HmmFit {
    iterations: int,
    log_likelihood: float,
    converged: bool,
    aic: float,
    bic: float,
}

struct Hmm {
    k: int,
    mu: float[4],
    sigma: float[4],
    pi: float[4],
    a: float[16],

    # Quantile-based start: state i takes the i-th volatility tercile/
    # quartile of absolute deviations.
    frame initial(k0: int, x: *float, n: int) ret Hmm {
        local h: Hmm;
        h.k = k0 < 2 ? 2 : (k0 > MAX_STATES ? MAX_STATES : k0);
        local mean: float = 0.0;
        loop (local t: int = 0; t < n; t = t + 1) {
            mean = mean + x[t];
        }
        mean = mean / cast<float>(n);
        local var: float = 0.0;
        loop (local t: int = 0; t < n; t = t + 1) {
            var = var + ((x[t] - mean) * (x[t] - mean));
        }
        local sd: float = Math.sqrt(var / cast<float>(n));
        loop (local i: int = 0; i < h.k; i = i + 1) {
            h.mu[i] = mean;
            h.sigma[i] = sd * (0.5 + cast<float>(i));
            h.pi[i] = 1.0 / cast<float>(h.k);
            loop (local j: int = 0; j < h.k; j = j + 1) {
                h.a[(i * MAX_STATES) + j] = i == j ? 0.9 : 0.1 / cast<float>(h.k - 1);
            }
        }
        return h;
    }

    frame density(this: *Hmm, state: int, x: float) ret float {
        local s: float = this.sigma[state];
        local z: float = (x - this.mu[state]) / s;
        return Math.exp(-0.5 * z * z) / (s * 2.5066282746310002);
    }

    frame trans(this: *Hmm, i: int, j: int) ret float {
        return this.a[(i * MAX_STATES) + j];
    }

    # Scaled forward pass; alpha is n x K, scale is n. Returns log-likelihood.
    frame forward(this: *Hmm, x: *float, n: int, alpha: *float, scale: *float) ret float {
        local ll: float = 0.0;
        loop (local t: int = 0; t < n; t = t + 1) {
            local c: float = 0.0;
            loop (local j: int = 0; j < this.k; j = j + 1) {
                local prior: float = 0.0;
                if (t == 0) {
                    prior = this.pi[j];
                } else {
                    loop (local i: int = 0; i < this.k; i = i + 1) {
                        prior = prior + (alpha[((t - 1) * MAX_STATES) + i] * this.trans(i, j));
                    }
                }
                local v: float = prior * Math.max(this.density(j, x[t]), 0.0000000000000000000000000000000000000001);
                alpha[(t * MAX_STATES) + j] = v;
                c = c + v;
            }
            if (c <= 0.0) {
                c = 0.0000000000000000000000000000000000000001;
            }
            scale[t] = c;
            loop (local j: int = 0; j < this.k; j = j + 1) {
                alpha[(t * MAX_STATES) + j] = alpha[(t * MAX_STATES) + j] / c;
            }
            ll = ll + Math.log(c);
        }
        return ll;
    }

    frame backward(this: *Hmm, x: *float, n: int, scale: *float, beta: *float) {
        loop (local j: int = 0; j < this.k; j = j + 1) {
            beta[((n - 1) * MAX_STATES) + j] = 1.0;
        }
        local t: int = n - 2;
        loop (t >= 0) {
            loop (local i: int = 0; i < this.k; i = i + 1) {
                local s: float = 0.0;
                loop (local j: int = 0; j < this.k; j = j + 1) {
                    s = s + (this.trans(i, j) * this.density(j, x[t + 1]) * beta[((t + 1) * MAX_STATES) + j]);
                }
                beta[(t * MAX_STATES) + i] = s / scale[t + 1];
            }
            t = t - 1;
        }
    }

    # Baum-Welch; returns the fit summary. `gamma_out` (n x MAX_STATES)
    # receives smoothed state probabilities when not null.
    frame fit(this: *Hmm, x: *float, n: int, max_iter: int, tol: float, gamma_out: *float) ret HmmFit {
        local width: long = cast<long>(n) * cast<long>(MAX_STATES) * sizeof(float);
        local alpha: *float = cast<*float>(malloc(width));
        local beta: *float = cast<*float>(malloc(width));
        local gamma: *float = cast<*float>(malloc(width));
        local scale: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        local out: HmmFit = HmmFit { iterations: 0, log_likelihood: 0.0, converged: false, aic: 0.0, bic: 0.0 };
        local prev: float = -1000000000000000000000000000000.0;
        loop (local iter: int = 0; iter < max_iter; iter = iter + 1) {
            local ll: float = this.forward(x, n, alpha, scale);
            this.backward(x, n, scale, beta);
            out.iterations = iter + 1;
            out.log_likelihood = ll;
            if (Math.abs(ll - prev) < tol) {
                out.converged = true;
                break;
            }
            prev = ll;
            loop (local t: int = 0; t < n; t = t + 1) {
                local s: float = 0.0;
                loop (local i: int = 0; i < this.k; i = i + 1) {
                    local g: float = alpha[(t * MAX_STATES) + i] * beta[(t * MAX_STATES) + i];
                    gamma[(t * MAX_STATES) + i] = g;
                    s = s + g;
                }
                loop (local i: int = 0; i < this.k; i = i + 1) {
                    gamma[(t * MAX_STATES) + i] = gamma[(t * MAX_STATES) + i] / s;
                }
            }
            # Transition counts from xi_t(i, j).
            local num: float[16];
            local den: float[4];
            loop (local i: int = 0; i < 16; i = i + 1) {
                num[i] = 0.0;
            }
            loop (local i: int = 0; i < 4; i = i + 1) {
                den[i] = 0.0;
            }
            loop (local t: int = 0; t < (n - 1); t = t + 1) {
                loop (local i: int = 0; i < this.k; i = i + 1) {
                    loop (local j: int = 0; j < this.k; j = j + 1) {
                        local xi: float = (alpha[(t * MAX_STATES) + i] * this.trans(i, j) * this.density(j, x[t + 1]) * beta[((t + 1) * MAX_STATES) + j]) / scale[t + 1];
                        num[(i * MAX_STATES) + j] = num[(i * MAX_STATES) + j] + xi;
                    }
                    den[i] = den[i] + gamma[(t * MAX_STATES) + i];
                }
            }
            loop (local i: int = 0; i < this.k; i = i + 1) {
                this.pi[i] = gamma[i];
                local row: float = 0.0;
                loop (local j: int = 0; j < this.k; j = j + 1) {
                    local v: float = den[i] > 0.0 ? num[(i * MAX_STATES) + j] / den[i] : 1.0 / cast<float>(this.k);
                    this.a[(i * MAX_STATES) + j] = Math.max(v, 0.000001);
                    row = row + this.a[(i * MAX_STATES) + j];
                }
                loop (local j: int = 0; j < this.k; j = j + 1) {
                    this.a[(i * MAX_STATES) + j] = this.a[(i * MAX_STATES) + j] / row;
                }
                local w: float = 0.0;
                local m: float = 0.0;
                loop (local t: int = 0; t < n; t = t + 1) {
                    w = w + gamma[(t * MAX_STATES) + i];
                    m = m + (gamma[(t * MAX_STATES) + i] * x[t]);
                }
                if (w > 0.0) {
                    this.mu[i] = m / w;
                    local v2: float = 0.0;
                    loop (local t: int = 0; t < n; t = t + 1) {
                        local d: float = x[t] - this.mu[i];
                        v2 = v2 + (gamma[(t * MAX_STATES) + i] * d * d);
                    }
                    this.sigma[i] = Math.max(Math.sqrt(v2 / w), 0.0000001);
                }
            }
        }
        this.sortStates();
        # Final posteriors with the sorted parameters.
        out.log_likelihood = this.forward(x, n, alpha, scale);
        this.backward(x, n, scale, beta);
        if (gamma_out != nullptr) {
            loop (local t: int = 0; t < n; t = t + 1) {
                local s: float = 0.0;
                loop (local i: int = 0; i < this.k; i = i + 1) {
                    s = s + (alpha[(t * MAX_STATES) + i] * beta[(t * MAX_STATES) + i]);
                }
                loop (local i: int = 0; i < MAX_STATES; i = i + 1) {
                    gamma_out[(t * MAX_STATES) + i] = i < this.k ? (alpha[(t * MAX_STATES) + i] * beta[(t * MAX_STATES) + i]) / s : 0.0;
                }
            }
        }
        local params: float = cast<float>(((this.k * this.k) + (2 * this.k)) - 1);
        out.aic = (2.0 * params) - (2.0 * out.log_likelihood);
        out.bic = (params * Math.log(cast<float>(n))) - (2.0 * out.log_likelihood);
        free(cast<*void>(alpha));
        free(cast<*void>(beta));
        free(cast<*void>(gamma));
        free(cast<*void>(scale));
        return out;
    }

    # Orders states by sigma (ascending), permuting every parameter.
    frame sortStates(this: *Hmm) {
        local order: int[4] = [0, 1, 2, 3];
        loop (local i: int = 1; i < this.k; i = i + 1) {
            local j: int = i;
            loop ((j > 0) && (this.sigma[order[j]] < this.sigma[order[j - 1]])) {
                local tmp: int = order[j];
                order[j] = order[j - 1];
                order[j - 1] = tmp;
                j = j - 1;
            }
        }
        local old: Hmm = *this;
        loop (local i: int = 0; i < this.k; i = i + 1) {
            this.mu[i] = old.mu[order[i]];
            this.sigma[i] = old.sigma[order[i]];
            this.pi[i] = old.pi[order[i]];
            loop (local j: int = 0; j < this.k; j = j + 1) {
                this.a[(i * MAX_STATES) + j] = old.a[(order[i] * MAX_STATES) + order[j]];
            }
        }
    }

    # Most likely state path (log-space Viterbi).
    frame viterbi(this: *Hmm, x: *float, n: int, path: *int) ret float {
        local delta: *float = cast<*float>(malloc(cast<long>(n) * cast<long>(MAX_STATES) * sizeof(float)));
        local back: *int = cast<*int>(malloc(cast<long>(n) * cast<long>(MAX_STATES) * sizeof(int)));
        loop (local j: int = 0; j < this.k; j = j + 1) {
            delta[j] = Math.log(Math.max(this.pi[j], 0.0000000000000000000000000000000000000001)) + Math.log(Math.max(this.density(j, x[0]), 0.0000000000000000000000000000000000000001));
            back[j] = 0;
        }
        loop (local t: int = 1; t < n; t = t + 1) {
            loop (local j: int = 0; j < this.k; j = j + 1) {
                local best: float = -1000000000000000000000000000000.0;
                local arg: int = 0;
                loop (local i: int = 0; i < this.k; i = i + 1) {
                    local v: float = delta[((t - 1) * MAX_STATES) + i] + Math.log(this.trans(i, j));
                    if (v > best) {
                        best = v;
                        arg = i;
                    }
                }
                delta[(t * MAX_STATES) + j] = best + Math.log(Math.max(this.density(j, x[t]), 0.0000000000000000000000000000000000000001));
                back[(t * MAX_STATES) + j] = arg;
            }
        }
        local best: float = -1000000000000000000000000000000.0;
        local state: int = 0;
        loop (local j: int = 0; j < this.k; j = j + 1) {
            if (delta[((n - 1) * MAX_STATES) + j] > best) {
                best = delta[((n - 1) * MAX_STATES) + j];
                state = j;
            }
        }
        local t: int = n - 1;
        loop (t >= 0) {
            path[t] = state;
            state = back[(t * MAX_STATES) + state];
            t = t - 1;
        }
        free(cast<*void>(delta));
        free(cast<*void>(back));
        return best;
    }

    # Expected number of bars spent in a state per visit: 1 / (1 - a_ii).
    frame duration(this: *Hmm, state: int) ret float {
        local stay: float = this.trans(state, state);
        return stay < 1.0 ? 1.0 / (1.0 - stay) : 1000000000.0;
    }

    # Stationary distribution by power iteration.
    frame stationary(this: *Hmm, out: *float) {
        loop (local i: int = 0; i < this.k; i = i + 1) {
            out[i] = 1.0 / cast<float>(this.k);
        }
        local next: float[4];
        loop (local it: int = 0; it < 1000; it = it + 1) {
            loop (local j: int = 0; j < this.k; j = j + 1) {
                next[j] = 0.0;
                loop (local i: int = 0; i < this.k; i = i + 1) {
                    next[j] = next[j] + (out[i] * this.trans(i, j));
                }
            }
            loop (local j: int = 0; j < this.k; j = j + 1) {
                out[j] = next[j];
            }
        }
    }
}
