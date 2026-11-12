# Interest-rate curves.
#
# A DiscountCurve stores pillar times (years) and continuously compounded
# zero rates and interpolates either linearly in zero rate, log-linearly in
# discount factor (piecewise-flat forwards) or with a natural cubic spline.
# Bootstrapping builds a curve from deposits, FRAs and par swaps.
# Nelson-Siegel-Svensson fits a parametric curve by Nelder-Mead.

import malloc, free from "std/c.bpl";
import [Math] from "std/math.bpl";
import [Optimize], [MinResult], [RootResult] from "../math/optimize.bpl";

export [DiscountCurve];
export [Interp];
export [CurveInstrument];
export [InstrumentKind];
export [NelsonSiegel];
export [Bootstrap];

enum Interp {
    LinearZero,
    LogLinearDiscount,
    CubicSpline,
}

enum InstrumentKind {
    Deposit,
    Fra,
    Swap,
}

struct CurveInstrument {
    kind: InstrumentKind,
    # Deposit: maturity; FRA: start/end; swap: maturity with `frequency` payments a year.
    start: float,
    maturity: float,
    rate: float,
    frequency: int,
}

struct DiscountCurve {
    times: *float,
    zeros: *float,
    # Second derivatives for the spline (natural boundary conditions).
    spline: *float,
    n: int,
    cap: int,
    interp: Interp,

    frame new(capacity: int, interp: Interp) ret DiscountCurve {
        local c: DiscountCurve;
        c.cap = capacity < 4 ? 4 : capacity;
        c.times = cast<*float>(malloc(cast<long>(c.cap) * sizeof(float)));
        c.zeros = cast<*float>(malloc(cast<long>(c.cap) * sizeof(float)));
        c.spline = cast<*float>(malloc(cast<long>(c.cap) * sizeof(float)));
        c.n = 0;
        c.interp = interp;
        return c;
    }

    frame flat(rate: float) ret DiscountCurve {
        local c: DiscountCurve = DiscountCurve.new(4, Interp.LinearZero);
        c.add(0.25, rate);
        c.add(30.0, rate);
        return c;
    }

    frame destroy(this: *DiscountCurve) {
        if (this.times != nullptr) {
            free(cast<*void>(this.times));
            free(cast<*void>(this.zeros));
            free(cast<*void>(this.spline));
            this.times = nullptr;
        }
        this.n = 0;
    }

    frame grow(this: *DiscountCurve) {
        local next_cap: int = this.cap * 2;
        local t: *float = cast<*float>(malloc(cast<long>(next_cap) * sizeof(float)));
        local z: *float = cast<*float>(malloc(cast<long>(next_cap) * sizeof(float)));
        local sp: *float = cast<*float>(malloc(cast<long>(next_cap) * sizeof(float)));
        loop (local i: int = 0; i < this.n; i = i + 1) {
            t[i] = this.times[i];
            z[i] = this.zeros[i];
            sp[i] = this.spline[i];
        }
        free(cast<*void>(this.times));
        free(cast<*void>(this.zeros));
        free(cast<*void>(this.spline));
        this.times = t;
        this.zeros = z;
        this.spline = sp;
        this.cap = next_cap;
    }

    # Adds or replaces a pillar, keeping times sorted.
    frame add(this: *DiscountCurve, t: float, zero: float) {
        loop (local i: int = 0; i < this.n; i = i + 1) {
            if (this.times[i] == t) {
                this.zeros[i] = zero;
                this.rebuild();
                return;
            }
        }
        if (this.n == this.cap) {
            this.grow();
        }
        local pos: int = this.n;
        loop ((pos > 0) && (this.times[pos - 1] > t)) {
            this.times[pos] = this.times[pos - 1];
            this.zeros[pos] = this.zeros[pos - 1];
            pos = pos - 1;
        }
        this.times[pos] = t;
        this.zeros[pos] = zero;
        this.n = this.n + 1;
        this.rebuild();
    }

    # Natural cubic spline coefficients over (times, zeros).
    frame rebuild(this: *DiscountCurve) {
        local n: int = this.n;
        loop (local i: int = 0; i < n; i = i + 1) {
            this.spline[i] = 0.0;
        }
        if (n < 3) {
            return;
        }
        local u: *float = cast<*float>(malloc(cast<long>(n) * sizeof(float)));
        u[0] = 0.0;
        loop (local i: int = 1; i < (n - 1); i = i + 1) {
            local sig: float = (this.times[i] - this.times[i - 1]) / (this.times[i + 1] - this.times[i - 1]);
            local p: float = (sig * this.spline[i - 1]) + 2.0;
            this.spline[i] = (sig - 1.0) / p;
            local d1: float = (this.zeros[i + 1] - this.zeros[i]) / (this.times[i + 1] - this.times[i]);
            local d0: float = (this.zeros[i] - this.zeros[i - 1]) / (this.times[i] - this.times[i - 1]);
            u[i] = (((6.0 * (d1 - d0)) / (this.times[i + 1] - this.times[i - 1])) - (sig * u[i - 1])) / p;
        }
        this.spline[n - 1] = 0.0;
        local k: int = n - 2;
        loop (k >= 0) {
            this.spline[k] = (this.spline[k] * this.spline[k + 1]) + u[k];
            k = k - 1;
        }
        free(cast<*void>(u));
    }

    frame segment(this: *DiscountCurve, t: float) ret int {
        local lo: int = 0;
        local hi: int = this.n - 1;
        loop ((hi - lo) > 1) {
            local mid: int = (lo + hi) >> 1;
            if (this.times[mid] > t) {
                hi = mid;
            } else {
                lo = mid;
            }
        }
        return lo;
    }

    frame zero(this: *DiscountCurve, t: float) ret float {
        if (this.n == 0) {
            return 0.0;
        }
        if ((this.n == 1) || (t <= this.times[0])) {
            return this.zeros[0];
        }
        if (t >= this.times[this.n - 1]) {
            return this.zeros[this.n - 1];
        }
        local i: int = this.segment(t);
        local t0: float = this.times[i];
        local t1: float = this.times[i + 1];
        local z0: float = this.zeros[i];
        local z1: float = this.zeros[i + 1];
        if (this.interp == Interp.LinearZero) {
            return z0 + (((z1 - z0) * (t - t0)) / (t1 - t0));
        }
        if (this.interp == Interp.LogLinearDiscount) {
            # Linear in log discount factor: r(t) t is linear in t.
            local a: float = z0 * t0;
            local b: float = z1 * t1;
            return (a + (((b - a) * (t - t0)) / (t1 - t0))) / t;
        }
        local h: float = t1 - t0;
        local aa: float = (t1 - t) / h;
        local bb: float = (t - t0) / h;
        return (aa * z0) + (bb * z1) + ((((((aa * aa * aa) - aa) * this.spline[i]) + (((bb * bb * bb) - bb) * this.spline[i + 1])) * h * h) / 6.0);
    }

    frame discount(this: *DiscountCurve, t: float) ret float {
        if (t <= 0.0) {
            return 1.0;
        }
        return Math.exp(-this.zero(t) * t);
    }

    # Continuously compounded forward rate between t1 and t2.
    frame forward(this: *DiscountCurve, t1: float, t2: float) ret float {
        if (t2 <= t1) {
            return this.zero(t1);
        }
        return Math.log(this.discount(t1) / this.discount(t2)) / (t2 - t1);
    }

    # Simple (money-market) forward rate between t1 and t2.
    frame simpleForward(this: *DiscountCurve, t1: float, t2: float) ret float {
        return ((this.discount(t1) / this.discount(t2)) - 1.0) / (t2 - t1);
    }

    frame instantaneousForward(this: *DiscountCurve, t: float) ret float {
        local h: float = 0.0001;
        return this.forward(t, t + h);
    }

    # Par swap rate for a swap paying `frequency` times a year to `maturity`.
    frame parRate(this: *DiscountCurve, maturity: float, frequency: int) ret float {
        local dt: float = 1.0 / cast<float>(frequency);
        local annuity: float = 0.0;
        local t: float = dt;
        loop (t <= (maturity + 0.0000001)) {
            annuity = annuity + (dt * this.discount(t));
            t = t + dt;
        }
        if (annuity == 0.0) {
            return 0.0;
        }
        return (1.0 - this.discount(maturity)) / annuity;
    }

    frame annuity(this: *DiscountCurve, start: float, maturity: float, frequency: int) ret float {
        local dt: float = 1.0 / cast<float>(frequency);
        local a: float = 0.0;
        local t: float = start + dt;
        loop (t <= (maturity + 0.0000001)) {
            a = a + (dt * this.discount(t));
            t = t + dt;
        }
        return a;
    }

    # Parallel shift copy (in rate units, e.g. 0.0001 = 1bp).
    frame shifted(this: *DiscountCurve, bump: float) ret DiscountCurve {
        local c: DiscountCurve = DiscountCurve.new(this.n, this.interp);
        loop (local i: int = 0; i < this.n; i = i + 1) {
            c.add(this.times[i], this.zeros[i] + bump);
        }
        return c;
    }

    # Bumps one pillar only (key-rate shift).
    frame keyShifted(this: *DiscountCurve, pillar: int, bump: float) ret DiscountCurve {
        local c: DiscountCurve = DiscountCurve.new(this.n, this.interp);
        loop (local i: int = 0; i < this.n; i = i + 1) {
            c.add(this.times[i], this.zeros[i] + (i == pillar ? bump : 0.0));
        }
        return c;
    }
}

struct Bootstrap {
    # Builds a log-linear curve from instruments sorted by maturity.
    frame build(instruments: *CurveInstrument, count: int, interp: Interp, error: *string) ret DiscountCurve {
        local c: DiscountCurve = DiscountCurve.new(count + 2, interp);
        *error = nullptr;
        loop (local i: int = 0; i < count; i = i + 1) {
            local inst: CurveInstrument = instruments[i];
            if ((i > 0) && (inst.maturity <= instruments[i - 1].maturity)) {
                *error = "instruments must have increasing maturities";
                return c;
            }
            if (inst.maturity <= 0.0) {
                *error = "maturity must be positive";
                return c;
            }
            if (inst.kind == InstrumentKind.Deposit) {
                local df: float = 1.0 / (1.0 + (inst.rate * inst.maturity));
                c.add(inst.maturity, -Math.log(df) / inst.maturity);
                continue;
            }
            if (inst.kind == InstrumentKind.Fra) {
                if (c.n == 0) {
                    *error = "FRA needs an earlier pillar for its start date";
                    return c;
                }
                local df_start: float = c.discount(inst.start);
                local df_end: float = df_start / (1.0 + (inst.rate * (inst.maturity - inst.start)));
                c.add(inst.maturity, -Math.log(df_end) / inst.maturity);
                continue;
            }
            # Swap: solve for the final discount factor that prices the swap at par.
            local freq: int = inst.frequency < 1 ? 1 : inst.frequency;
            local dt: float = 1.0 / cast<float>(freq);
            local known: float = 0.0;
            local t: float = dt;
            loop (t < (inst.maturity - 0.0000001)) {
                known = known + (dt * c.discount(t));
                t = t + dt;
            }
            # Intermediate coupon dates beyond the last pillar extrapolate flat;
            # refine by iterating the final pillar a few times.
            local guess: float = (1.0 - (inst.rate * known)) / (1.0 + (inst.rate * dt));
            if (guess <= 0.0) {
                *error = "swap rate implies a negative discount factor";
                return c;
            }
            c.add(inst.maturity, -Math.log(guess) / inst.maturity);
            loop (local it: int = 0; it < 30; it = it + 1) {
                local annuity: float = c.annuity(0.0, inst.maturity, freq);
                local par: float = (1.0 - c.discount(inst.maturity)) / annuity;
                local diff: float = par - inst.rate;
                if (Math.abs(diff) < 0.000000000001) {
                    break;
                }
                local z: float = c.zero(inst.maturity);
                # d(par)/dz is about maturity * DF(T) / annuity.
                local slope: float = (inst.maturity * c.discount(inst.maturity)) / annuity;
                c.add(inst.maturity, z - (diff / slope));
            }
        }
        # A cubic spline is non-local: later pillars move earlier par rates.
        # Re-solve every swap pillar against the full curve until all reprice.
        if (interp == Interp.CubicSpline) {
            loop (local pass: int = 0; pass < 50; pass = pass + 1) {
                local worst: float = 0.0;
                loop (local i: int = 0; i < count; i = i + 1) {
                    local inst: CurveInstrument = instruments[i];
                    if (inst.kind != InstrumentKind.Swap) {
                        continue;
                    }
                    local freq: int = inst.frequency < 1 ? 1 : inst.frequency;
                    local annuity: float = c.annuity(0.0, inst.maturity, freq);
                    local diff: float = ((1.0 - c.discount(inst.maturity)) / annuity) - inst.rate;
                    worst = Math.max(worst, Math.abs(diff));
                    local slope: float = (inst.maturity * c.discount(inst.maturity)) / annuity;
                    c.add(inst.maturity, c.zero(inst.maturity) - (diff / slope));
                }
                if (worst < 0.000000000001) {
                    break;
                }
            }
        }
        return c;
    }
}

struct NelsonSiegel {
    beta0: float,
    beta1: float,
    beta2: float,
    beta3: float,
    tau1: float,
    tau2: float,
    rmse: float,
    iterations: int,

    frame zero(this: *NelsonSiegel, t: float) ret float {
        if (t <= 0.0) {
            return this.beta0 + this.beta1;
        }
        local x1: float = t / this.tau1;
        local x2: float = t / this.tau2;
        local f1: float = (1.0 - Math.exp(-x1)) / x1;
        local f2: float = f1 - Math.exp(-x1);
        local f3: float = ((1.0 - Math.exp(-x2)) / x2) - Math.exp(-x2);
        return this.beta0 + (this.beta1 * f1) + (this.beta2 * f2) + (this.beta3 * f3);
    }

    # Fits Svensson parameters to (t, zero) observations by least squares.
    frame fit(times: *float, zeros: *float, n: int) ret NelsonSiegel {
        local ts: *float = times;
        local zs: *float = zeros;
        local objective: Lambda<float>(*float) = |p: *float| ret float {
            local tau1: float = p[4];
            local tau2: float = p[5];
            if ((tau1 <= 0.01) || (tau2 <= 0.01) || (tau1 > 30.0) || (tau2 > 30.0)) {
                return 1000000.0;
            }
            local m: NelsonSiegel = NelsonSiegel { beta0: p[0], beta1: p[1], beta2: p[2], beta3: p[3], tau1: tau1, tau2: tau2, rmse: 0.0, iterations: 0 };
            local s: float = 0.0;
            loop (local i: int = 0; i < n; i = i + 1) {
                local d: float = m.zero(ts[i]) - zs[i];
                s = s + (d * d);
            }
            return s;
        };
        local start: float[6] = [zeros[n - 1], zeros[0] - zeros[n - 1], 0.0, 0.0, 1.5, 6.0];
        local res: MinResult = Optimize.nelderMead(objective, &start[0], 6, 0.01, 0.0000000000000001, 20000);
        local out: NelsonSiegel = NelsonSiegel { beta0: res.x[0], beta1: res.x[1], beta2: res.x[2], beta3: res.x[3], tau1: res.x[4], tau2: res.x[5], rmse: Math.sqrt(res.fx / cast<float>(n)), iterations: res.iterations };
        res.destroy();
        return out;
    }
}
