# Lattice pricers: Cox-Ross-Rubinstein and Leisen-Reimer binomial trees,
# a Boyle trinomial tree, and an explicit/Crank-Nicolson finite-difference
# grid. All support American early exercise.

import [Math] from "std/math.bpl";
import malloc, free from "std/c.bpl";
import [OptionSpec], [OptionKind] from "./black_scholes.bpl";

export [Lattice];
export [TreeResult];

struct TreeResult {
    price: float,
    delta: float,
    gamma: float,
    theta: float,
    early_exercise_nodes: int,
    steps: int,
}

struct Lattice {
    frame payoff(is_call: bool, spot: float, strike: float) ret float {
        local v: float = is_call ? spot - strike : strike - spot;
        return v > 0.0 ? v : 0.0;
    }

    frame crr(s: *OptionSpec, steps: int, american: bool) ret TreeResult {
        local n: int = steps < 3 ? 3 : steps;
        local dt: float = s.expiry / cast<float>(n);
        local u: float = Math.exp(s.vol * Math.sqrt(dt));
        local d: float = 1.0 / u;
        local growth: float = Math.exp((s.rate - s.dividend) * dt);
        local p: float = (growth - d) / (u - d);
        local disc: float = Math.exp(-s.rate * dt);
        local is_call: bool = s.isCall();
        local values: *float = cast<*float>(malloc(cast<long>(n + 1) * sizeof(float)));
        local res: TreeResult;
        res.early_exercise_nodes = 0;
        res.steps = n;
        # Terminal payoffs: node j has j up-moves.
        local spot_n: float = s.spot * Math.pow(d, cast<float>(n));
        local ud: float = u / d;
        loop (local j: int = 0; j <= n; j = j + 1) {
            values[j] = Lattice.payoff(is_call, spot_n, s.strike);
            spot_n = spot_n * ud;
        }
        local v1u: float = 0.0;
        local v1d: float = 0.0;
        local v2uu: float = 0.0;
        local v2ud: float = 0.0;
        local v2dd: float = 0.0;
        local i: int = n - 1;
        loop (i >= 0) {
            local spot_i: float = s.spot * Math.pow(d, cast<float>(i));
            loop (local j: int = 0; j <= i; j = j + 1) {
                local cont: float = disc * ((p * values[j + 1]) + ((1.0 - p) * values[j]));
                if (american) {
                    local ex: float = Lattice.payoff(is_call, spot_i, s.strike);
                    if (ex > cont) {
                        cont = ex;
                        res.early_exercise_nodes = res.early_exercise_nodes + 1;
                    }
                }
                values[j] = cont;
                spot_i = spot_i * ud;
            }
            if (i == 2) {
                v2dd = values[0];
                v2ud = values[1];
                v2uu = values[2];
            }
            if (i == 1) {
                v1d = values[0];
                v1u = values[1];
            }
            i = i - 1;
        }
        res.price = values[0];
        local su: float = s.spot * u;
        local sd: float = s.spot * d;
        res.delta = (v1u - v1d) / (su - sd);
        local suu: float = s.spot * u * u;
        local sdd: float = s.spot * d * d;
        local delta_up: float = (v2uu - v2ud) / (suu - s.spot);
        local delta_dn: float = (v2ud - v2dd) / (s.spot - sdd);
        res.gamma = (delta_up - delta_dn) / (0.5 * (suu - sdd));
        res.theta = (v2ud - res.price) / (2.0 * dt) / 365.0;
        free(cast<*void>(values));
        return res;
    }

    # Peizer-Pratt inversion (method 2) used by Leisen-Reimer.
    frame peizerPratt(z: float, n: int) ret float {
        local nf: float = cast<float>(n);
        local t: float = z / (nf + (1.0 / 3.0) + (0.1 / (nf + 1.0)));
        local sgn: float = z >= 0.0 ? 1.0 : -1.0;
        return 0.5 + (sgn * 0.5 * Math.sqrt(1.0 - Math.exp(-t * t * (nf + (1.0 / 6.0)))));
    }

    # Leisen-Reimer tree: converges much faster than CRR for Europeans.
    frame leisenReimer(s: *OptionSpec, steps: int, american: bool) ret TreeResult {
        local n: int = steps;
        if ((n % 2) == 0) {
            n = n + 1;
        }
        local dt: float = s.expiry / cast<float>(n);
        local sqt: float = Math.sqrt(s.expiry);
        local d1: float = (Math.log(s.spot / s.strike) + (((s.rate - s.dividend) + (0.5 * s.vol * s.vol)) * s.expiry)) / (s.vol * sqt);
        local d2: float = d1 - (s.vol * sqt);
        local pbar: float = Lattice.peizerPratt(d1, n);
        local p: float = Lattice.peizerPratt(d2, n);
        local growth: float = Math.exp((s.rate - s.dividend) * dt);
        local u: float = (growth * pbar) / p;
        local d: float = (growth - (p * u)) / (1.0 - p);
        local disc: float = Math.exp(-s.rate * dt);
        local is_call: bool = s.isCall();
        local values: *float = cast<*float>(malloc(cast<long>(n + 1) * sizeof(float)));
        local res: TreeResult;
        res.early_exercise_nodes = 0;
        res.steps = n;
        loop (local j: int = 0; j <= n; j = j + 1) {
            local st: float = s.spot * Math.pow(u, cast<float>(j)) * Math.pow(d, cast<float>(n - j));
            values[j] = Lattice.payoff(is_call, st, s.strike);
        }
        local v1u: float = 0.0;
        local v1d: float = 0.0;
        local i: int = n - 1;
        loop (i >= 0) {
            loop (local j: int = 0; j <= i; j = j + 1) {
                local cont: float = disc * ((p * values[j + 1]) + ((1.0 - p) * values[j]));
                if (american) {
                    local st: float = s.spot * Math.pow(u, cast<float>(j)) * Math.pow(d, cast<float>(i - j));
                    local ex: float = Lattice.payoff(is_call, st, s.strike);
                    if (ex > cont) {
                        cont = ex;
                        res.early_exercise_nodes = res.early_exercise_nodes + 1;
                    }
                }
                values[j] = cont;
            }
            if (i == 1) {
                v1d = values[0];
                v1u = values[1];
            }
            i = i - 1;
        }
        res.price = values[0];
        res.delta = (v1u - v1d) / ((s.spot * u) - (s.spot * d));
        res.gamma = 0.0;
        res.theta = 0.0;
        free(cast<*void>(values));
        return res;
    }

    # Boyle trinomial tree.
    frame trinomial(s: *OptionSpec, steps: int, american: bool) ret TreeResult {
        local n: int = steps < 2 ? 2 : steps;
        local dt: float = s.expiry / cast<float>(n);
        local dx: float = s.vol * Math.sqrt(3.0 * dt);
        local nu: float = s.rate - s.dividend - (0.5 * s.vol * s.vol);
        local a: float = ((s.vol * s.vol * dt) + (nu * nu * dt * dt)) / (dx * dx);
        local b: float = (nu * dt) / dx;
        local pu: float = 0.5 * (a + b);
        local pd: float = 0.5 * (a - b);
        local pm: float = 1.0 - a;
        local disc: float = Math.exp(-s.rate * dt);
        local width: int = (2 * n) + 1;
        local values: *float = cast<*float>(malloc(cast<long>(width) * sizeof(float)));
        local next: *float = cast<*float>(malloc(cast<long>(width) * sizeof(float)));
        local is_call: bool = s.isCall();
        local res: TreeResult;
        res.early_exercise_nodes = 0;
        res.steps = n;
        loop (local j: int = 0; j < width; j = j + 1) {
            local st: float = s.spot * Math.exp(cast<float>(j - n) * dx);
            values[j] = Lattice.payoff(is_call, st, s.strike);
        }
        local i: int = n - 1;
        loop (i >= 0) {
            # At step i the live nodes are offsets -i..i, stored at n-i..n+i.
            loop (local j: int = n - i; j <= (n + i); j = j + 1) {
                local cont: float = disc * ((pu * values[j + 1]) + (pm * values[j]) + (pd * values[j - 1]));
                if (american) {
                    local st: float = s.spot * Math.exp(cast<float>(j - n) * dx);
                    local ex: float = Lattice.payoff(is_call, st, s.strike);
                    if (ex > cont) {
                        cont = ex;
                        res.early_exercise_nodes = res.early_exercise_nodes + 1;
                    }
                }
                next[j] = cont;
            }
            loop (local j: int = n - i; j <= (n + i); j = j + 1) {
                values[j] = next[j];
            }
            if (i == 1) {
                res.delta = (values[n + 1] - values[n - 1]) / ((s.spot * Math.exp(dx)) - (s.spot * Math.exp(-dx)));
            }
            i = i - 1;
        }
        res.price = values[n];
        res.gamma = 0.0;
        res.theta = 0.0;
        free(cast<*void>(values));
        free(cast<*void>(next));
        return res;
    }

    # Crank-Nicolson finite differences in log-spot with projected SOR for
    # the American constraint.
    frame crankNicolson(s: *OptionSpec, space_steps: int, time_steps: int, american: bool) ret float {
        local m: int = space_steps < 10 ? 10 : space_steps;
        local nt: int = time_steps < 10 ? 10 : time_steps;
        local sigma2: float = s.vol * s.vol;
        local x_max: float = Math.log(s.spot) + (5.0 * s.vol * Math.sqrt(s.expiry));
        local x_min: float = Math.log(s.spot) - (5.0 * s.vol * Math.sqrt(s.expiry));
        local dx: float = (x_max - x_min) / cast<float>(m);
        local dt: float = s.expiry / cast<float>(nt);
        local nu: float = s.rate - s.dividend - (0.5 * sigma2);
        local alpha: float = 0.25 * dt * ((sigma2 / (dx * dx)) - (nu / dx));
        local beta: float = -0.5 * dt * ((sigma2 / (dx * dx)) + s.rate);
        local gamma: float = 0.25 * dt * ((sigma2 / (dx * dx)) + (nu / dx));
        local is_call: bool = s.isCall();
        local v: *float = cast<*float>(malloc(cast<long>(m + 1) * sizeof(float)));
        local rhs: *float = cast<*float>(malloc(cast<long>(m + 1) * sizeof(float)));
        local ex: *float = cast<*float>(malloc(cast<long>(m + 1) * sizeof(float)));
        loop (local j: int = 0; j <= m; j = j + 1) {
            local st: float = Math.exp(x_min + (dx * cast<float>(j)));
            ex[j] = Lattice.payoff(is_call, st, s.strike);
            v[j] = ex[j];
        }
        local omega: float = 1.2;
        loop (local t: int = 0; t < nt; t = t + 1) {
            local tau: float = dt * cast<float>(t + 1);
            loop (local j: int = 1; j < m; j = j + 1) {
                rhs[j] = (alpha * v[j - 1]) + ((1.0 + beta) * v[j]) + (gamma * v[j + 1]);
            }
            # Boundary values.
            local s_max: float = Math.exp(x_max);
            if (is_call) {
                v[0] = 0.0;
                v[m] = (s_max * Math.exp(-s.dividend * tau)) - (s.strike * Math.exp(-s.rate * tau));
            } else {
                v[0] = s.strike * Math.exp(-s.rate * tau);
                v[m] = 0.0;
            }
            if (american) {
                if (v[0] < ex[0]) {
                    v[0] = ex[0];
                }
                if (v[m] < ex[m]) {
                    v[m] = ex[m];
                }
            }
            # Projected SOR on (1 - beta) v_j - alpha v_{j-1} - gamma v_{j+1} = rhs_j.
            loop (local it: int = 0; it < 200; it = it + 1) {
                local err: float = 0.0;
                loop (local j: int = 1; j < m; j = j + 1) {
                    local gs: float = (rhs[j] + (alpha * v[j - 1]) + (gamma * v[j + 1])) / (1.0 - beta);
                    local nv: float = v[j] + (omega * (gs - v[j]));
                    if (american && (nv < ex[j])) {
                        nv = ex[j];
                    }
                    local diff: float = nv - v[j];
                    err = err + (diff * diff);
                    v[j] = nv;
                }
                if (err < 0.0000000000001) {
                    break;
                }
            }
        }
        # Linear interpolation at log(spot).
        local x0: float = Math.log(s.spot);
        local pos: float = (x0 - x_min) / dx;
        local k: int = cast<int>(Math.floor(pos));
        local w: float = pos - cast<float>(k);
        local price: float = (v[k] * (1.0 - w)) + (v[k + 1] * w);
        free(cast<*void>(v));
        free(cast<*void>(rhs));
        free(cast<*void>(ex));
        return price;
    }

    # Barone-Adesi-Whaley quadratic approximation for American options.
    frame baroneAdesiWhaley(s: *OptionSpec, euro_price: float) ret float {
        local sigma2: float = s.vol * s.vol;
        local t: float = s.expiry;
        local r: float = s.rate;
        local b: float = s.rate - s.dividend;
        local m: float = (2.0 * r) / sigma2;
        local nn: float = (2.0 * b) / sigma2;
        local k: float = 1.0 - Math.exp(-r * t);
        if (k == 0.0) {
            return euro_price;
        }
        local is_call: bool = s.isCall();
        if (is_call && (b >= r)) {
            return euro_price;
        }
        local q: float = 0.0;
        if (is_call) {
            q = (-(nn - 1.0) + Math.sqrt(((nn - 1.0) * (nn - 1.0)) + ((4.0 * m) / k))) / 2.0;
        } else {
            q = (-(nn - 1.0) - Math.sqrt(((nn - 1.0) * (nn - 1.0)) + ((4.0 * m) / k))) / 2.0;
        }
        # Newton iteration for the critical price.
        local sc: float = s.strike;
        loop (local i: int = 0; i < 100; i = i + 1) {
            local sp: OptionSpec = s.withSpot(sc);
            local d1: float = (Math.log(sc / s.strike) + ((b + (0.5 * sigma2)) * t)) / (s.vol * Math.sqrt(t));
            local nd1: float = 0.5 * (1.0 + Lattice.erfApprox(d1 / 1.4142135623730951));
            local pdf: float = Math.exp(-0.5 * d1 * d1) * 0.3989422804014327;
            local euro: float = Lattice.europeanPrice(&sp);
            local carry: float = Math.exp((b - r) * t);
            local lhs: float = 0.0;
            local rhs: float = 0.0;
            local slope: float = 0.0;
            if (is_call) {
                lhs = sc - s.strike;
                rhs = euro + (((1.0 - (carry * nd1)) * sc) / q);
                slope = (carry * nd1 * (1.0 - (1.0 / q))) + ((1.0 - ((carry * pdf) / (s.vol * Math.sqrt(t)))) / q);
                local next: float = ((s.strike + rhs) - (slope * sc)) / (1.0 - slope);
                if ((Math.abs(lhs - rhs) / s.strike) < 0.000001) {
                    break;
                }
                sc = next;
            } else {
                lhs = s.strike - sc;
                rhs = euro - (((1.0 - (carry * (1.0 - nd1))) * sc) / q);
                slope = (-carry * (1.0 - nd1) * (1.0 - (1.0 / q))) - ((1.0 + ((carry * pdf) / (s.vol * Math.sqrt(t)))) / q);
                local next: float = ((s.strike - rhs) + (slope * sc)) / (1.0 + slope);
                if ((Math.abs(lhs - rhs) / s.strike) < 0.000001) {
                    break;
                }
                sc = next;
            }
        }
        local d1c: float = (Math.log(sc / s.strike) + ((b + (0.5 * sigma2)) * t)) / (s.vol * Math.sqrt(t));
        local nd1c: float = 0.5 * (1.0 + Lattice.erfApprox(d1c / 1.4142135623730951));
        local carry: float = Math.exp((b - r) * t);
        if (is_call) {
            if (s.spot >= sc) {
                return s.spot - s.strike;
            }
            local a2: float = (sc / q) * (1.0 - (carry * nd1c));
            return euro_price + (a2 * Math.pow(s.spot / sc, q));
        }
        if (s.spot <= sc) {
            return s.strike - s.spot;
        }
        local a1: float = (-sc / q) * (1.0 - (carry * (1.0 - nd1c)));
        return euro_price + (a1 * Math.pow(s.spot / sc, q));
    }

    # Abramowitz-Stegun 7.1.26 erf: only used inside the BAW iteration.
    frame erfApprox(x: float) ret float {
        local sgn: float = x < 0.0 ? -1.0 : 1.0;
        local ax: float = Math.abs(x);
        local t: float = 1.0 / (1.0 + (0.3275911 * ax));
        local y: float = 1.0 - (((((((((1.061405429 * t) - 1.453152027) * t) + 1.421413741) * t) - 0.284496736) * t) + 0.254829592) * t * Math.exp(-ax * ax));
        return sgn * y;
    }

    frame europeanPrice(s: *OptionSpec) ret float {
        local sqt: float = Math.sqrt(s.expiry);
        local d1: float = (Math.log(s.spot / s.strike) + (((s.rate - s.dividend) + (0.5 * s.vol * s.vol)) * s.expiry)) / (s.vol * sqt);
        local d2: float = d1 - (s.vol * sqt);
        local nd1: float = 0.5 * (1.0 + Lattice.erfApprox(d1 / 1.4142135623730951));
        local nd2: float = 0.5 * (1.0 + Lattice.erfApprox(d2 / 1.4142135623730951));
        local df: float = Math.exp(-s.rate * s.expiry);
        local qf: float = Math.exp(-s.dividend * s.expiry);
        if (s.isCall()) {
            return (s.spot * qf * nd1) - (s.strike * df * nd2);
        }
        return (s.strike * df * (1.0 - nd2)) - (s.spot * qf * (1.0 - nd1));
    }
}
