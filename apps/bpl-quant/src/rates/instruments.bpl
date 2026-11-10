# Fixed-income instruments: bonds, swaps, FRAs, caps/floors and swaptions,
# plus Vasicek/CIR closed forms and a Hull-White trinomial tree.

import malloc, free from "std/c.bpl";
import [Math] from "std/math.bpl";
import [Special] from "../math/special.bpl";
import [Optimize], [RootResult] from "../math/optimize.bpl";
import [BlackScholes] from "../quant/black_scholes.bpl";
import [DiscountCurve] from "./curve.bpl";

export [Bond];
export [BondMetrics];
export [Swap];
export [SwapMetrics];
export [CapFloor];
export [ShortRate];
export [DayCount];

struct DayCount {
    # Year fraction between serial day numbers.
    frame act360(d0: long, d1: long) ret float {
        return cast<float>(d1 - d0) / 360.0;
    }

    frame act365(d0: long, d1: long) ret float {
        return cast<float>(d1 - d0) / 365.0;
    }

    # 30/360 US on (y, m, d) triples.
    frame thirty360(y0: int, m0: int, d0: int, y1: int, m1: int, d1: int) ret float {
        local a: int = d0 == 31 ? 30 : d0;
        local b: int = (d1 == 31) && (a >= 30) ? 30 : d1;
        return cast<float>((360 * (y1 - y0)) + (30 * (m1 - m0)) + (b - a)) / 360.0;
    }

    # Days since 1970-01-01 for a proleptic Gregorian date.
    frame serial(y: int, m: int, d: int) ret long {
        local yy: long = cast<long>(m <= 2 ? y - 1 : y);
        local era: long = (yy >= 0 ? yy : yy - 399) / 400;
        local yoe: long = yy - (era * 400);
        local mm: long = cast<long>(m);
        local doy: long = ((((153 * (mm + (mm > 2 ? -3 : 9))) + 2) / 5) + cast<long>(d)) - 1;
        local doe: long = (((yoe * 365) + (yoe / 4)) - (yoe / 100)) + doy;
        return ((era * 146097) + doe) - 719468;
    }

    frame isLeap(y: int) ret bool {
        return (((y % 4) == 0) && ((y % 100) != 0)) || ((y % 400) == 0);
    }

    # Day of week, 0 = Monday.
    frame weekday(serial: long) ret int {
        local w: long = (serial + 3) % 7;
        if (w < 0) {
            w = w + 7;
        }
        return cast<int>(w);
    }

    # Modified following business-day adjustment (weekends only).
    frame modifiedFollowing(serial: long) ret long {
        local s: long = serial;
        loop (DayCount.weekday(s) >= 5) {
            s = s + 1;
        }
        return s;
    }
}

struct BondMetrics {
    price: float,
    clean: float,
    accrued: float,
    yield: float,
    macaulay: float,
    modified: float,
    convexity: float,
    dv01: float,
    z_spread: float,
}

struct Bond {
    face: float,
    coupon: float,
    maturity: float,
    frequency: int,
    # Time since the last coupon, as a fraction of a period.
    accrual: float,

    frame new(face: float, coupon: float, maturity: float, frequency: int) ret Bond {
        return Bond { face: face, coupon: coupon, maturity: maturity, frequency: frequency < 1 ? 1 : frequency, accrual: 0.0 };
    }

    frame periods(this: *Bond) ret int {
        return cast<int>(Math.ceil((this.maturity * cast<float>(this.frequency)) - 0.0000001));
    }

    frame cashflowTime(this: *Bond, k: int) ret float {
        # Coupons fall at maturity - (n - k) / f.
        local n: int = this.periods();
        return this.maturity - (cast<float>(n - k) / cast<float>(this.frequency));
    }

    frame couponAmount(this: *Bond) ret float {
        return (this.face * this.coupon) / cast<float>(this.frequency);
    }

    # Dirty price at a yield with `frequency` compounding.
    frame priceFromYield(this: *Bond, y: float) ret float {
        local f: float = cast<float>(this.frequency);
        local n: int = this.periods();
        local c: float = this.couponAmount();
        local s: float = 0.0;
        loop (local k: int = 1; k <= n; k = k + 1) {
            local t: float = this.cashflowTime(k);
            local cf: float = k == n ? c + this.face : c;
            s = s + (cf / Math.pow(1.0 + (y / f), t * f));
        }
        return s;
    }

    frame priceFromCurve(this: *Bond, curve: *DiscountCurve, spread: float) ret float {
        local n: int = this.periods();
        local c: float = this.couponAmount();
        local s: float = 0.0;
        loop (local k: int = 1; k <= n; k = k + 1) {
            local t: float = this.cashflowTime(k);
            local cf: float = k == n ? c + this.face : c;
            s = s + (cf * curve.discount(t) * Math.exp(-spread * t));
        }
        return s;
    }

    frame accruedInterest(this: *Bond) ret float {
        return this.couponAmount() * this.accrual;
    }

    frame yieldFromPrice(this: *Bond, dirty: float) ret RootResult {
        local b: Bond = *this;
        local objective: Lambda<float>(float) = |y: float| ret float {
            return b.priceFromYield(y) - dirty;
        };
        return Optimize.brent(objective, -0.5, 2.0, 0.000000000001, 200);
    }

    frame zSpread(this: *Bond, curve: *DiscountCurve, dirty: float) ret float {
        local b: Bond = *this;
        local objective: Lambda<float>(float) = |z: float| ret float {
            return b.priceFromCurve(curve, z) - dirty;
        };
        local r: RootResult = Optimize.brent(objective, -0.2, 1.0, 0.000000000001, 200);
        return r.x;
    }

    frame metrics(this: *Bond, y: float) ret BondMetrics {
        local m: BondMetrics;
        local f: float = cast<float>(this.frequency);
        local n: int = this.periods();
        local c: float = this.couponAmount();
        local pv: float = 0.0;
        local weighted: float = 0.0;
        local convex: float = 0.0;
        loop (local k: int = 1; k <= n; k = k + 1) {
            local t: float = this.cashflowTime(k);
            local cf: float = k == n ? c + this.face : c;
            local disc: float = Math.pow(1.0 + (y / f), t * f);
            local v: float = cf / disc;
            pv = pv + v;
            weighted = weighted + (t * v);
            convex = convex + (v * t * (t + (1.0 / f)));
        }
        m.price = pv;
        m.accrued = this.accruedInterest();
        m.clean = pv - m.accrued;
        m.yield = y;
        m.macaulay = weighted / pv;
        m.modified = m.macaulay / (1.0 + (y / f));
        m.convexity = convex / (pv * (1.0 + (y / f)) * (1.0 + (y / f)));
        m.dv01 = m.modified * pv * 0.0001;
        m.z_spread = 0.0;
        return m;
    }

    # Price change estimate from duration and convexity for a yield change.
    frame priceChange(m: *BondMetrics, dy: float) ret float {
        return m.price * ((-m.modified * dy) + (0.5 * m.convexity * dy * dy));
    }
}

struct SwapMetrics {
    npv: float,
    par_rate: float,
    fixed_leg: float,
    float_leg: float,
    annuity: float,
    pv01: float,
}

struct Swap {
    notional: float,
    fixed_rate: float,
    maturity: float,
    frequency: int,
    pay_fixed: bool,

    frame value(this: *Swap, curve: *DiscountCurve) ret SwapMetrics {
        local m: SwapMetrics;
        m.annuity = curve.annuity(0.0, this.maturity, this.frequency);
        m.fixed_leg = this.notional * this.fixed_rate * m.annuity;
        # Floating leg of a spot-starting swap = N (1 - DF(T)).
        m.float_leg = this.notional * (1.0 - curve.discount(this.maturity));
        m.par_rate = curve.parRate(this.maturity, this.frequency);
        local npv: float = m.float_leg - m.fixed_leg;
        m.npv = this.pay_fixed ? npv : -npv;
        m.pv01 = this.notional * m.annuity * 0.0001;
        return m;
    }

    # Bucketed sensitivities: NPV change for 1bp on each pillar.
    frame keyRateDeltas(this: *Swap, curve: *DiscountCurve, out: *float) {
        local base: SwapMetrics = this.value(curve);
        loop (local i: int = 0; i < curve.n; i = i + 1) {
            local bumped: DiscountCurve = curve.keyShifted(i, 0.0001);
            local m: SwapMetrics = this.value(&bumped);
            out[i] = m.npv - base.npv;
            bumped.destroy();
        }
    }
}

struct CapFloor {
    # Black-76 caplet on a forward rate, paid at t_end, notional 1.
    frame caplet(curve: *DiscountCurve, t_start: float, t_end: float, strike: float, vol: float, is_cap: bool) ret float {
        local fwd: float = curve.simpleForward(t_start, t_end);
        local tau: float = t_end - t_start;
        local df: float = curve.discount(t_end);
        if (t_start <= 0.0) {
            local intrinsic: float = is_cap ? fwd - strike : strike - fwd;
            return intrinsic > 0.0 ? df * tau * intrinsic : 0.0;
        }
        local sd: float = vol * Math.sqrt(t_start);
        local d1: float = (Math.log(fwd / strike) + (0.5 * sd * sd)) / sd;
        local d2: float = d1 - sd;
        if (is_cap) {
            return df * tau * ((fwd * Special.normCdf(d1)) - (strike * Special.normCdf(d2)));
        }
        return df * tau * ((strike * Special.normCdf(-d2)) - (fwd * Special.normCdf(-d1)));
    }

    frame price(curve: *DiscountCurve, maturity: float, frequency: int, strike: float, vol: float, is_cap: bool, notional: float) ret float {
        local dt: float = 1.0 / cast<float>(frequency);
        local s: float = 0.0;
        local t: float = dt;
        loop (t <= (maturity + 0.0000001)) {
            s = s + CapFloor.caplet(curve, t - dt, t, strike, vol, is_cap);
            t = t + dt;
        }
        return s * notional;
    }

    # Payer/receiver European swaption under Black-76 on the forward swap rate.
    frame swaption(curve: *DiscountCurve, expiry: float, tenor: float, frequency: int, strike: float, vol: float, payer: bool, notional: float) ret float {
        local annuity: float = curve.annuity(expiry, expiry + tenor, frequency);
        local fwd: float = (curve.discount(expiry) - curve.discount(expiry + tenor)) / annuity;
        local sd: float = vol * Math.sqrt(expiry);
        local d1: float = (Math.log(fwd / strike) + (0.5 * sd * sd)) / sd;
        local d2: float = d1 - sd;
        if (payer) {
            return notional * annuity * ((fwd * Special.normCdf(d1)) - (strike * Special.normCdf(d2)));
        }
        return notional * annuity * ((strike * Special.normCdf(-d2)) - (fwd * Special.normCdf(-d1)));
    }
}

struct ShortRate {
    # Vasicek zero-coupon bond price P(0, T).
    frame vasicekBond(r0: float, a: float, b: float, sigma: float, t: float) ret float {
        local bt: float = (1.0 - Math.exp(-a * t)) / a;
        local at: float = ((b - ((sigma * sigma) / (2.0 * a * a))) * (bt - t)) - ((sigma * sigma * bt * bt) / (4.0 * a));
        return Math.exp(at - (bt * r0));
    }

    # Cox-Ingersoll-Ross zero-coupon bond price P(0, T).
    frame cirBond(r0: float, a: float, b: float, sigma: float, t: float) ret float {
        local h: float = Math.sqrt((a * a) + (2.0 * sigma * sigma));
        local e: float = Math.exp(h * t) - 1.0;
        local denom: float = (2.0 * h) + ((a + h) * e);
        local at: float = Math.pow((2.0 * h * Math.exp(((a + h) * t) / 2.0)) / denom, (2.0 * a * b) / (sigma * sigma));
        local bt: float = (2.0 * e) / denom;
        return at * Math.exp(-bt * r0);
    }

    frame zeroRate(price: float, t: float) ret float {
        return -Math.log(price) / t;
    }

    # Hull-White one-factor trinomial tree fitted to `curve`; prices a
    # zero-coupon bond maturing at `maturity` (should match the curve) and a
    # European option on it struck at `strike` expiring at `expiry`.
    frame hullWhiteTree(curve: *DiscountCurve, a: float, sigma: float, maturity: float, steps: int, expiry: float, strike: float, bond_out: *float) ret float {
        local dt: float = maturity / cast<float>(steps);
        local dx: float = sigma * Math.sqrt(3.0 * dt);
        local jmax: int = cast<int>(Math.ceil(0.1835 / (a * dt)));
        local width: int = (2 * jmax) + 1;
        local pu: *float = cast<*float>(malloc(cast<long>(width) * sizeof(float)));
        local pm: *float = cast<*float>(malloc(cast<long>(width) * sizeof(float)));
        local pd: *float = cast<*float>(malloc(cast<long>(width) * sizeof(float)));
        local shift: *int = cast<*int>(malloc(cast<long>(width) * sizeof(int)));
        loop (local idx: int = 0; idx < width; idx = idx + 1) {
            local j: int = idx - jmax;
            local m: float = -a * cast<float>(j) * dt;
            if (j == jmax) {
                shift[idx] = -1;
                pu[idx] = (7.0 / 6.0) + (((m * m) - (3.0 * m)) / 2.0);
                pm[idx] = ((-1.0 / 3.0) - (m * m)) + (2.0 * m);
                pd[idx] = (1.0 / 6.0) + (((m * m) - m) / 2.0);
            } else if (j == -jmax) {
                shift[idx] = 1;
                pu[idx] = (1.0 / 6.0) + (((m * m) + m) / 2.0);
                pm[idx] = (-1.0 / 3.0) - (m * m) - (2.0 * m);
                pd[idx] = (7.0 / 6.0) + (((m * m) + (3.0 * m)) / 2.0);
            } else {
                shift[idx] = 0;
                pu[idx] = (1.0 / 6.0) + (((m * m) + m) / 2.0);
                pm[idx] = (2.0 / 3.0) - (m * m);
                pd[idx] = (1.0 / 6.0) + (((m * m) - m) / 2.0);
            }
        }
        # Forward induction of Arrow-Debreu prices to fit alpha(t) to the curve.
        local alpha: *float = cast<*float>(malloc(cast<long>(steps + 1) * sizeof(float)));
        local q: *float = cast<*float>(malloc(cast<long>(width) * sizeof(float)));
        local qn: *float = cast<*float>(malloc(cast<long>(width) * sizeof(float)));
        loop (local idx: int = 0; idx < width; idx = idx + 1) {
            q[idx] = 0.0;
        }
        q[jmax] = 1.0;
        loop (local i: int = 0; i < steps; i = i + 1) {
            local reach: int = i < jmax ? i : jmax;
            local s: float = 0.0;
            loop (local j: int = -reach; j <= reach; j = j + 1) {
                s = s + (q[j + jmax] * Math.exp(-cast<float>(j) * dx * dt));
            }
            local p_next: float = curve.discount(cast<float>(i + 1) * dt);
            alpha[i] = (Math.log(s) - Math.log(p_next)) / dt;
            loop (local idx: int = 0; idx < width; idx = idx + 1) {
                qn[idx] = 0.0;
            }
            loop (local j: int = -reach; j <= reach; j = j + 1) {
                local idx: int = j + jmax;
                local disc: float = q[idx] * Math.exp(-(alpha[i] + (cast<float>(j) * dx)) * dt);
                local k: int = j + shift[idx];
                qn[k + 1 + jmax] = qn[k + 1 + jmax] + (disc * pu[idx]);
                qn[k + jmax] = qn[k + jmax] + (disc * pm[idx]);
                qn[(k - 1) + jmax] = qn[(k - 1) + jmax] + (disc * pd[idx]);
            }
            loop (local idx: int = 0; idx < width; idx = idx + 1) {
                q[idx] = qn[idx];
            }
        }
        # Backward induction: bond pays 1 at maturity; the option is exercised at expiry.
        local v: *float = cast<*float>(malloc(cast<long>(width) * sizeof(float)));
        local vn: *float = cast<*float>(malloc(cast<long>(width) * sizeof(float)));
        local opt: *float = cast<*float>(malloc(cast<long>(width) * sizeof(float)));
        local optn: *float = cast<*float>(malloc(cast<long>(width) * sizeof(float)));
        loop (local idx: int = 0; idx < width; idx = idx + 1) {
            v[idx] = 1.0;
            opt[idx] = 0.0;
        }
        local expiry_step: int = cast<int>(Math.round(expiry / dt));
        local i: int = steps - 1;
        loop (i >= 0) {
            local reach: int = i < jmax ? i : jmax;
            loop (local j: int = -reach; j <= reach; j = j + 1) {
                local idx: int = j + jmax;
                local k: int = j + shift[idx];
                local disc: float = Math.exp(-(alpha[i] + (cast<float>(j) * dx)) * dt);
                vn[idx] = disc * ((pu[idx] * v[k + 1 + jmax]) + (pm[idx] * v[k + jmax]) + (pd[idx] * v[(k - 1) + jmax]));
                optn[idx] = disc * ((pu[idx] * opt[k + 1 + jmax]) + (pm[idx] * opt[k + jmax]) + (pd[idx] * opt[(k - 1) + jmax]));
            }
            loop (local j: int = -reach; j <= reach; j = j + 1) {
                local idx: int = j + jmax;
                v[idx] = vn[idx];
                opt[idx] = optn[idx];
                if (i == expiry_step) {
                    local payoff: float = v[idx] - strike;
                    opt[idx] = payoff > 0.0 ? payoff : 0.0;
                }
            }
            i = i - 1;
        }
        *bond_out = v[jmax];
        local result: float = opt[jmax];
        free(cast<*void>(pu));
        free(cast<*void>(pm));
        free(cast<*void>(pd));
        free(cast<*void>(shift));
        free(cast<*void>(alpha));
        free(cast<*void>(q));
        free(cast<*void>(qn));
        free(cast<*void>(v));
        free(cast<*void>(vn));
        free(cast<*void>(opt));
        free(cast<*void>(optn));
        return result;
    }

    # Jamshidian closed form for a European call on a zero-coupon bond under Hull-White.
    frame hullWhiteBondOption(curve: *DiscountCurve, a: float, sigma: float, expiry: float, maturity: float, strike: float) ret float {
        local p_t: float = curve.discount(expiry);
        local p_s: float = curve.discount(maturity);
        local b: float = (1.0 - Math.exp(-a * (maturity - expiry))) / a;
        local sp: float = sigma * b * Math.sqrt((1.0 - Math.exp(-2.0 * a * expiry)) / (2.0 * a));
        local h: float = (Math.log(p_s / (p_t * strike)) / sp) + (sp / 2.0);
        return (p_s * Special.normCdf(h)) - (strike * p_t * Special.normCdf(h - sp));
    }
}
