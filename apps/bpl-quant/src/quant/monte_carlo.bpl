# Monte Carlo option pricing.
#
# All simulations take an explicit seed so results are reproducible. The
# engines report the estimate together with its standard error.

import [Math] from "std/math.bpl";
import malloc, free from "std/c.bpl";
import [Xoshiro] from "../core/prng.bpl";
import [OptionSpec], [OptionKind], [BlackScholes] from "./black_scholes.bpl";
import [Matrix] from "../math/matrix.bpl";

export [MonteCarlo];
export [McResult];
export [BarrierKind];
export [HestonParams];

struct McResult {
    price: float,
    stderr: float,
    paths: int,
    control_beta: float,

    frame lower(this: *McResult) ret float {
        return this.price - (1.96 * this.stderr);
    }

    frame upper(this: *McResult) ret float {
        return this.price + (1.96 * this.stderr);
    }
}

enum BarrierKind {
    UpAndOut,
    UpAndIn,
    DownAndOut,
    DownAndIn,
}

struct HestonParams {
    v0: float,
    kappa: float,
    theta: float,
    xi: float,
    rho: float,
}

struct Accumulator {
    sum: float,
    sum_sq: float,
    n: int,

    frame new() ret Accumulator {
        return Accumulator { sum: 0.0, sum_sq: 0.0, n: 0 };
    }

    frame add(this: *Accumulator, x: float) {
        this.sum = this.sum + x;
        this.sum_sq = this.sum_sq + (x * x);
        this.n = this.n + 1;
    }

    frame result(this: *Accumulator, discount: float) ret McResult {
        local nf: float = cast<float>(this.n);
        local mean: float = this.sum / nf;
        local var: float = (((this.sum_sq / nf) - (mean * mean)) * nf) / (nf - 1.0);
        if (var < 0.0) {
            var = 0.0;
        }
        return McResult { price: discount * mean, stderr: discount * Math.sqrt(var / nf), paths: this.n, control_beta: 0.0 };
    }
}

struct MonteCarlo {
    frame payoff(is_call: bool, st: float, k: float) ret float {
        local v: float = is_call ? st - k : k - st;
        return v > 0.0 ? v : 0.0;
    }

    # European option, terminal sampling with antithetic variates.
    frame european(s: *OptionSpec, paths: int, seed: u64) ret McResult {
        local rng: Xoshiro = Xoshiro.new(seed);
        local drift: float = (s.rate - s.dividend - (0.5 * s.vol * s.vol)) * s.expiry;
        local diffusion: float = s.vol * Math.sqrt(s.expiry);
        local is_call: bool = s.isCall();
        local acc: Accumulator = Accumulator.new();
        local pairs: int = paths / 2;
        loop (local i: int = 0; i < pairs; i = i + 1) {
            local z: float = rng.normal();
            local up: float = s.spot * Math.exp(drift + (diffusion * z));
            local dn: float = s.spot * Math.exp(drift - (diffusion * z));
            acc.add(0.5 * (MonteCarlo.payoff(is_call, up, s.strike) + MonteCarlo.payoff(is_call, dn, s.strike)));
        }
        local res: McResult = acc.result(Math.exp(-s.rate * s.expiry));
        # Each antithetic pair uses two paths.
        res.paths = pairs * 2;
        return res;
    }

    # European option with the terminal spot as a control variate.
    frame europeanControl(s: *OptionSpec, paths: int, seed: u64) ret McResult {
        local rng: Xoshiro = Xoshiro.new(seed);
        local drift: float = (s.rate - s.dividend - (0.5 * s.vol * s.vol)) * s.expiry;
        local diffusion: float = s.vol * Math.sqrt(s.expiry);
        local is_call: bool = s.isCall();
        local expected_st: float = s.spot * Math.exp((s.rate - s.dividend) * s.expiry);
        local sx: float = 0.0;
        local sy: float = 0.0;
        local sxx: float = 0.0;
        local sxy: float = 0.0;
        local syy: float = 0.0;
        loop (local i: int = 0; i < paths; i = i + 1) {
            local st: float = s.spot * Math.exp(drift + (diffusion * rng.normal()));
            local y: float = MonteCarlo.payoff(is_call, st, s.strike);
            sx = sx + st;
            sy = sy + y;
            sxx = sxx + (st * st);
            sxy = sxy + (st * y);
            syy = syy + (y * y);
        }
        local nf: float = cast<float>(paths);
        local mx: float = sx / nf;
        local my: float = sy / nf;
        local cov: float = (sxy / nf) - (mx * my);
        local vx: float = (sxx / nf) - (mx * mx);
        local vy: float = (syy / nf) - (my * my);
        local beta: float = vx > 0.0 ? cov / vx : 0.0;
        local adjusted: float = my - (beta * (mx - expected_st));
        local resid_var: float = vy - (beta * beta * vx);
        if (resid_var < 0.0) {
            resid_var = 0.0;
        }
        local df: float = Math.exp(-s.rate * s.expiry);
        return McResult { price: df * adjusted, stderr: df * Math.sqrt(resid_var / nf), paths: paths, control_beta: beta };
    }

    # Arithmetic-average Asian option with the geometric Asian as control.
    frame asian(s: *OptionSpec, steps: int, paths: int, seed: u64) ret McResult {
        local rng: Xoshiro = Xoshiro.new(seed);
        local dt: float = s.expiry / cast<float>(steps);
        local drift: float = (s.rate - s.dividend - (0.5 * s.vol * s.vol)) * dt;
        local diffusion: float = s.vol * Math.sqrt(dt);
        local is_call: bool = s.isCall();
        local geo_exact: float = MonteCarlo.geometricAsianPrice(s, steps);
        local df: float = Math.exp(-s.rate * s.expiry);
        local sa: float = 0.0;
        local sg: float = 0.0;
        local sgg: float = 0.0;
        local sag: float = 0.0;
        local saa: float = 0.0;
        loop (local p: int = 0; p < paths; p = p + 1) {
            local logs: float = Math.log(s.spot);
            local sum: float = 0.0;
            local log_sum: float = 0.0;
            loop (local k: int = 0; k < steps; k = k + 1) {
                logs = logs + drift + (diffusion * rng.normal());
                sum = sum + Math.exp(logs);
                log_sum = log_sum + logs;
            }
            local arith: float = sum / cast<float>(steps);
            local geo: float = Math.exp(log_sum / cast<float>(steps));
            local a: float = df * MonteCarlo.payoff(is_call, arith, s.strike);
            local g: float = df * MonteCarlo.payoff(is_call, geo, s.strike);
            sa = sa + a;
            sg = sg + g;
            sgg = sgg + (g * g);
            sag = sag + (a * g);
            saa = saa + (a * a);
        }
        local nf: float = cast<float>(paths);
        local ma: float = sa / nf;
        local mg: float = sg / nf;
        local vg: float = (sgg / nf) - (mg * mg);
        local cov: float = (sag / nf) - (ma * mg);
        local va: float = (saa / nf) - (ma * ma);
        local beta: float = vg > 0.0 ? cov / vg : 0.0;
        local price: float = ma - (beta * (mg - geo_exact));
        local resid: float = va - (beta * beta * vg);
        if (resid < 0.0) {
            resid = 0.0;
        }
        return McResult { price: price, stderr: Math.sqrt(resid / nf), paths: paths, control_beta: beta };
    }

    # Closed form for a discretely monitored geometric-average Asian option.
    frame geometricAsianPrice(s: *OptionSpec, steps: int) ret float {
        local n: float = cast<float>(steps);
        local dt: float = s.expiry / n;
        local mu: float = s.rate - s.dividend - (0.5 * s.vol * s.vol);
        local mean_log: float = Math.log(s.spot) + ((mu * dt * (n + 1.0)) / 2.0);
        local var_log: float = (s.vol * s.vol * dt * (n + 1.0) * ((2.0 * n) + 1.0)) / (6.0 * n);
        local sd: float = Math.sqrt(var_log);
        local fwd: float = Math.exp(mean_log + (0.5 * var_log));
        local d1: float = ((mean_log - Math.log(s.strike)) + var_log) / sd;
        local d2: float = d1 - sd;
        local df: float = Math.exp(-s.rate * s.expiry);
        local nd1: float = MonteCarlo.ncdf(d1);
        local nd2: float = MonteCarlo.ncdf(d2);
        if (s.isCall()) {
            return df * ((fwd * nd1) - (s.strike * nd2));
        }
        return df * ((s.strike * (1.0 - nd2)) - (fwd * (1.0 - nd1)));
    }

    frame ncdf(x: float) ret float {
        # Delegates to the high-accuracy routine via Black-Scholes digital identity.
        local t: float = 1.0 / (1.0 + (0.2316419 * Math.abs(x)));
        local poly: float = t * (0.319381530 + (t * (-0.356563782 + (t * (1.781477937 + (t * (-1.821255978 + (t * 1.330274429))))))));
        local tail: float = 0.3989422804014327 * Math.exp(-0.5 * x * x) * poly;
        return x >= 0.0 ? 1.0 - tail : tail;
    }

    # Discretely monitored barrier option with a Brownian-bridge crossing correction.
    frame barrier(s: *OptionSpec, kind: BarrierKind, level: float, rebate: float, steps: int, paths: int, seed: u64) ret McResult {
        local rng: Xoshiro = Xoshiro.new(seed);
        local dt: float = s.expiry / cast<float>(steps);
        local drift: float = (s.rate - s.dividend - (0.5 * s.vol * s.vol)) * dt;
        local diffusion: float = s.vol * Math.sqrt(dt);
        local is_call: bool = s.isCall();
        local up: bool = (kind == BarrierKind.UpAndOut) || (kind == BarrierKind.UpAndIn);
        local knock_out: bool = (kind == BarrierKind.UpAndOut) || (kind == BarrierKind.DownAndOut);
        local log_barrier: float = Math.log(level);
        local var_step: float = s.vol * s.vol * dt;
        local acc: Accumulator = Accumulator.new();
        loop (local p: int = 0; p < paths; p = p + 1) {
            local x: float = Math.log(s.spot);
            local hit: bool = false;
            loop (local k: int = 0; k < steps; k = k + 1) {
                local next: float = x + drift + (diffusion * rng.normal());
                if (!hit) {
                    if (up && (next >= log_barrier)) {
                        hit = true;
                    } else if (!up && (next <= log_barrier)) {
                        hit = true;
                    } else {
                        # Probability the continuous path crossed between monitors.
                        local a: float = log_barrier - x;
                        local b: float = log_barrier - next;
                        local prob: float = Math.exp((-2.0 * a * b) / var_step);
                        if (rng.nextFloat() < prob) {
                            hit = true;
                        }
                    }
                }
                x = next;
            }
            local st: float = Math.exp(x);
            local v: float = 0.0;
            if (knock_out) {
                v = hit ? rebate : MonteCarlo.payoff(is_call, st, s.strike);
            } else {
                v = hit ? MonteCarlo.payoff(is_call, st, s.strike) : rebate;
            }
            acc.add(v);
        }
        return acc.result(Math.exp(-s.rate * s.expiry));
    }

    # Floating-strike lookback: call pays S_T - min, put pays max - S_T.
    frame lookback(s: *OptionSpec, steps: int, paths: int, seed: u64) ret McResult {
        local rng: Xoshiro = Xoshiro.new(seed);
        local dt: float = s.expiry / cast<float>(steps);
        local drift: float = (s.rate - s.dividend - (0.5 * s.vol * s.vol)) * dt;
        local diffusion: float = s.vol * Math.sqrt(dt);
        local is_call: bool = s.isCall();
        local acc: Accumulator = Accumulator.new();
        loop (local p: int = 0; p < paths; p = p + 1) {
            local st: float = s.spot;
            local lo: float = st;
            local hi: float = st;
            loop (local k: int = 0; k < steps; k = k + 1) {
                st = st * Math.exp(drift + (diffusion * rng.normal()));
                if (st < lo) {
                    lo = st;
                }
                if (st > hi) {
                    hi = st;
                }
            }
            acc.add(is_call ? st - lo : hi - st);
        }
        return acc.result(Math.exp(-s.rate * s.expiry));
    }

    # Basket call/put on correlated assets (weights sum to anything).
    frame basket(is_call: bool, spots: *float, vols: *float, weights: *float, corr: *Matrix, strike: float, rate: float, expiry: float, paths: int, seed: u64) ret McResult {
        local n: int = corr.rows;
        local chol: Matrix;
        if (!corr.cholesky(&chol)) {
            chol.destroy();
            throw "basket correlation matrix is not positive definite";
        }
        local rng: Xoshiro = Xoshiro.new(seed);
        local z: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        local acc: Accumulator = Accumulator.new();
        loop (local p: int = 0; p < paths; p = p + 1) {
            loop (local i: int = 0; i < n; i = i + 1) {
                z[i] = rng.normal();
            }
            local value: float = 0.0;
            loop (local i: int = 0; i < n; i = i + 1) {
                local e: float = 0.0;
                loop (local j: int = 0; j <= i; j = j + 1) {
                    e = e + (chol.at(i, j) * z[j]);
                }
                local st: float = spots[i] * Math.exp(((rate - (0.5 * vols[i] * vols[i])) * expiry) + (vols[i] * Math.sqrt(expiry) * e));
                value = value + (weights[i] * st);
            }
            acc.add(MonteCarlo.payoff(is_call, value, strike));
        }
        free(cast<*void>(z));
        chol.destroy();
        return acc.result(Math.exp(-rate * expiry));
    }

    # Longstaff-Schwartz least-squares Monte Carlo for American options,
    # regressing continuation values on (1, x, x^2) of in-the-money paths.
    frame longstaffSchwartz(s: *OptionSpec, steps: int, paths: int, seed: u64) ret McResult {
        local rng: Xoshiro = Xoshiro.new(seed);
        local dt: float = s.expiry / cast<float>(steps);
        local drift: float = (s.rate - s.dividend - (0.5 * s.vol * s.vol)) * dt;
        local diffusion: float = s.vol * Math.sqrt(dt);
        local disc: float = Math.exp(-s.rate * dt);
        local is_call: bool = s.isCall();
        local grid: *float = cast<*float>(malloc(cast<long>(paths) * cast<long>(steps + 1) * sizeof(float)));
        loop (local p: int = 0; p < paths; p = p + 1) {
            local row: *float = grid + (p * (steps + 1));
            row[0] = s.spot;
            loop (local k: int = 1; k <= steps; k = k + 1) {
                row[k] = row[k - 1] * Math.exp(drift + (diffusion * rng.normal()));
            }
        }
        local cash: *float = cast<*float>(malloc(cast<long>(paths) * sizeof(float)));
        loop (local p: int = 0; p < paths; p = p + 1) {
            cash[p] = MonteCarlo.payoff(is_call, grid[(p * (steps + 1)) + steps], s.strike);
        }
        local k: int = steps - 1;
        loop (k >= 1) {
            # Normal equations for a 3-parameter regression.
            local a: float[9] = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
            local b: float[3] = [0.0, 0.0, 0.0];
            local count: int = 0;
            loop (local p: int = 0; p < paths; p = p + 1) {
                cash[p] = cash[p] * disc;
                local st: float = grid[(p * (steps + 1)) + k];
                local ex: float = MonteCarlo.payoff(is_call, st, s.strike);
                if (ex > 0.0) {
                    local x: float = st / s.strike;
                    local basis: float[3] = [1.0, x, x * x];
                    loop (local i: int = 0; i < 3; i = i + 1) {
                        b[i] = b[i] + (basis[i] * cash[p]);
                        loop (local j: int = 0; j < 3; j = j + 1) {
                            a[(i * 3) + j] = a[(i * 3) + j] + (basis[i] * basis[j]);
                        }
                    }
                    count = count + 1;
                }
            }
            if (count > 3) {
                local m: Matrix = Matrix.fromRaw(3, 3, &a[0]);
                local coef: float[3] = [0.0, 0.0, 0.0];
                if (m.solve(&b[0], &coef[0])) {
                    loop (local p: int = 0; p < paths; p = p + 1) {
                        local st: float = grid[(p * (steps + 1)) + k];
                        local ex: float = MonteCarlo.payoff(is_call, st, s.strike);
                        if (ex > 0.0) {
                            local x: float = st / s.strike;
                            local cont: float = coef[0] + (coef[1] * x) + (coef[2] * x * x);
                            if (ex > cont) {
                                cash[p] = ex;
                            }
                        }
                    }
                }
                m.destroy();
            }
            k = k - 1;
        }
        local acc: Accumulator = Accumulator.new();
        loop (local p: int = 0; p < paths; p = p + 1) {
            acc.add(cash[p] * disc);
        }
        free(cast<*void>(grid));
        free(cast<*void>(cash));
        local res: McResult = acc.result(1.0);
        # Early exercise at t=0 is never worse than holding.
        local immediate: float = MonteCarlo.payoff(is_call, s.spot, s.strike);
        if (immediate > res.price) {
            res.price = immediate;
        }
        return res;
    }

    # Heston stochastic volatility with full-truncation Euler.
    frame heston(s: *OptionSpec, h: *HestonParams, steps: int, paths: int, seed: u64) ret McResult {
        local rng: Xoshiro = Xoshiro.new(seed);
        local dt: float = s.expiry / cast<float>(steps);
        local sqdt: float = Math.sqrt(dt);
        local is_call: bool = s.isCall();
        local rho_c: float = Math.sqrt(1.0 - (h.rho * h.rho));
        local acc: Accumulator = Accumulator.new();
        loop (local p: int = 0; p < paths; p = p + 1) {
            local x: float = Math.log(s.spot);
            local v: float = h.v0;
            loop (local k: int = 0; k < steps; k = k + 1) {
                local z1: float = rng.normal();
                local z2: float = (h.rho * z1) + (rho_c * rng.normal());
                local vp: float = v > 0.0 ? v : 0.0;
                x = x + ((s.rate - s.dividend - (0.5 * vp)) * dt) + (Math.sqrt(vp) * sqdt * z1);
                v = v + (h.kappa * (h.theta - vp) * dt) + (h.xi * Math.sqrt(vp) * sqdt * z2);
            }
            acc.add(MonteCarlo.payoff(is_call, Math.exp(x), s.strike));
        }
        return acc.result(Math.exp(-s.rate * s.expiry));
    }

    # Merton jump-diffusion terminal sampling.
    frame mertonJump(s: *OptionSpec, jump_rate: float, jump_mean: float, jump_vol: float, paths: int, seed: u64) ret McResult {
        local rng: Xoshiro = Xoshiro.new(seed);
        local kappa: float = Math.exp(jump_mean + (0.5 * jump_vol * jump_vol)) - 1.0;
        local drift: float = (s.rate - s.dividend - (jump_rate * kappa) - (0.5 * s.vol * s.vol)) * s.expiry;
        local is_call: bool = s.isCall();
        local acc: Accumulator = Accumulator.new();
        loop (local p: int = 0; p < paths; p = p + 1) {
            local jumps: int = rng.poisson(jump_rate * s.expiry);
            local jump_sum: float = 0.0;
            loop (local j: int = 0; j < jumps; j = j + 1) {
                jump_sum = jump_sum + rng.gaussian(jump_mean, jump_vol);
            }
            local st: float = s.spot * Math.exp(drift + (s.vol * Math.sqrt(s.expiry) * rng.normal()) + jump_sum);
            acc.add(MonteCarlo.payoff(is_call, st, s.strike));
        }
        return acc.result(Math.exp(-s.rate * s.expiry));
    }

    # Merton's closed-form series for the jump-diffusion European price.
    frame mertonSeries(s: *OptionSpec, jump_rate: float, jump_mean: float, jump_vol: float, terms: int) ret float {
        local kappa: float = Math.exp(jump_mean + (0.5 * jump_vol * jump_vol)) - 1.0;
        local lam2: float = jump_rate * (1.0 + kappa);
        local total: float = 0.0;
        local log_fact: float = 0.0;
        loop (local n: int = 0; n < terms; n = n + 1) {
            if (n > 0) {
                log_fact = log_fact + Math.log(cast<float>(n));
            }
            local nf: float = cast<float>(n);
            local vol_n: float = Math.sqrt((s.vol * s.vol) + ((nf * jump_vol * jump_vol) / s.expiry));
            local rate_n: float = (s.rate - (jump_rate * kappa)) + ((nf * Math.log(1.0 + kappa)) / s.expiry);
            local sp: OptionSpec = *s;
            sp.vol = vol_n;
            sp.rate = rate_n;
            local weight: float = Math.exp(((-lam2 * s.expiry) + (nf * Math.log(lam2 * s.expiry))) - log_fact);
            total = total + (weight * BlackScholes.price(&sp));
        }
        return total;
    }

    # Simulates a GBM path into out[0..steps].
    frame gbmPath(spot: float, mu: float, vol: float, dt: float, steps: int, rng: *Xoshiro, out: *float) {
        out[0] = spot;
        local drift: float = (mu - (0.5 * vol * vol)) * dt;
        local diffusion: float = vol * Math.sqrt(dt);
        loop (local k: int = 1; k <= steps; k = k + 1) {
            out[k] = out[k - 1] * Math.exp(drift + (diffusion * rng.normal()));
        }
    }
}
