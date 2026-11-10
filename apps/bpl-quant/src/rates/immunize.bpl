# Liability immunization with a bond portfolio.
#
# Given liabilities (time, amount) and candidate bonds on a discount curve,
# immunize() picks two bonds bracketing the liability duration and solves
# for holdings that match the present value and the Macaulay duration
# (Redington: also checks convexity >= liability convexity). keyRates()
# reports key-rate PV01s of any cash-flow set so the residual curve risk
# of the hedge can be read off.

import [Math] from "std/math.bpl";
import [DiscountCurve] from "./curve.bpl";
import [Bond] from "./instruments.bpl";

export [Immunizer];
export [CashFlows];
export [ImmunizedPortfolio];

struct CashFlows {
    times: float[64],
    amounts: float[64],
    count: int,

    frame empty() ret CashFlows {
        local c: CashFlows;
        c.count = 0;
        return c;
    }

    frame add(this: *CashFlows, t: float, amount: float) {
        if (this.count < 64) {
            this.times[this.count] = t;
            this.amounts[this.count] = amount;
            this.count = this.count + 1;
        }
    }

    frame ofBond(b: *Bond, units: float) ret CashFlows {
        local c: CashFlows = CashFlows.empty();
        local n: int = b.periods();
        local cpn: float = b.couponAmount();
        loop (local k: int = 1; k <= n; k = k + 1) {
            c.add(b.cashflowTime(k), units * (k == n ? cpn + b.face : cpn));
        }
        return c;
    }

    frame pv(this: *CashFlows, curve: *DiscountCurve, bump: float) ret float {
        local s: float = 0.0;
        loop (local i: int = 0; i < this.count; i = i + 1) {
            local t: float = this.times[i];
            s = s + (this.amounts[i] * curve.discount(t) * Math.exp(-bump * t));
        }
        return s;
    }

    # Macaulay duration and convexity under continuous compounding.
    frame duration(this: *CashFlows, curve: *DiscountCurve) ret float {
        local pv: float = this.pv(curve, 0.0);
        local s: float = 0.0;
        loop (local i: int = 0; i < this.count; i = i + 1) {
            local t: float = this.times[i];
            s = s + (t * this.amounts[i] * curve.discount(t));
        }
        return pv != 0.0 ? s / pv : 0.0;
    }

    frame convexity(this: *CashFlows, curve: *DiscountCurve) ret float {
        local pv: float = this.pv(curve, 0.0);
        local s: float = 0.0;
        loop (local i: int = 0; i < this.count; i = i + 1) {
            local t: float = this.times[i];
            s = s + (t * t * this.amounts[i] * curve.discount(t));
        }
        return pv != 0.0 ? s / pv : 0.0;
    }

    frame merge(this: *CashFlows, other: *CashFlows, scale: float) {
        loop (local i: int = 0; i < other.count; i = i + 1) {
            this.add(other.times[i], scale * other.amounts[i]);
        }
    }
}

struct ImmunizedPortfolio {
    bond_a: int,
    bond_b: int,
    units_a: float,
    units_b: float,
    liability_pv: float,
    liability_duration: float,
    liability_convexity: float,
    asset_pv: float,
    asset_duration: float,
    asset_convexity: float,
    redington: bool,
    found: bool,
    # Surplus change for parallel shifts of -100, -50, +50, +100 bp.
    surplus: float[4],
}

struct Immunizer {
    frame immunize(curve: *DiscountCurve, liabilities: *CashFlows, bonds: *Bond, count: int) ret ImmunizedPortfolio {
        local out: ImmunizedPortfolio;
        out.found = false;
        out.liability_pv = liabilities.pv(curve, 0.0);
        out.liability_duration = liabilities.duration(curve);
        out.liability_convexity = liabilities.convexity(curve);
        # Choose the shortest bond longer than the liability and the longest
        # bond shorter than it.
        local below: int = -1;
        local above: int = -1;
        local db: float = -1.0;
        local da: float = 1000000.0;
        loop (local i: int = 0; i < count; i = i + 1) {
            local cf: CashFlows = CashFlows.ofBond(bonds + i, 1.0);
            local d: float = cf.duration(curve);
            if ((d <= out.liability_duration) && (d > db)) {
                db = d;
                below = i;
            }
            if ((d >= out.liability_duration) && (d < da)) {
                da = d;
                above = i;
            }
        }
        if ((below < 0) || (above < 0)) {
            return out;
        }
        local ca: CashFlows = CashFlows.ofBond(bonds + below, 1.0);
        local cb: CashFlows = CashFlows.ofBond(bonds + above, 1.0);
        local pa: float = ca.pv(curve, 0.0);
        local pb: float = cb.pv(curve, 0.0);
        # Solve x pa + y pb = PV_L and x pa da + y pb db = PV_L D_L.
        local d1: float = ca.duration(curve);
        local d2: float = cb.duration(curve);
        if (Math.abs(d2 - d1) < 0.000000001) {
            out.bond_a = below;
            out.bond_b = above;
            out.units_a = out.liability_pv / pa;
            out.units_b = 0.0;
        } else {
            local wa: float = (d2 - out.liability_duration) / (d2 - d1);
            out.bond_a = below;
            out.bond_b = above;
            out.units_a = (wa * out.liability_pv) / pa;
            out.units_b = ((1.0 - wa) * out.liability_pv) / pb;
        }
        local assets: CashFlows = CashFlows.empty();
        assets.merge(&ca, out.units_a);
        assets.merge(&cb, out.units_b);
        out.asset_pv = assets.pv(curve, 0.0);
        out.asset_duration = assets.duration(curve);
        out.asset_convexity = assets.convexity(curve);
        out.redington = out.asset_convexity >= (out.liability_convexity - 0.000000001);
        local shifts: float[4] = [-0.01, -0.005, 0.005, 0.01];
        loop (local k: int = 0; k < 4; k = k + 1) {
            out.surplus[k] = (assets.pv(curve, shifts[k]) - liabilities.pv(curve, shifts[k])) - (out.asset_pv - out.liability_pv);
        }
        out.found = true;
        return out;
    }

    # PV change for a 1bp bump of a triangular key-rate bucket at each of
    # `count` pillars (bucket weight falls linearly to zero at neighbours).
    frame keyRates(curve: *DiscountCurve, flows: *CashFlows, pillars: *float, count: int, out: *float) {
        local base: float = flows.pv(curve, 0.0);
        loop (local p: int = 0; p < count; p = p + 1) {
            local s: float = 0.0;
            loop (local i: int = 0; i < flows.count; i = i + 1) {
                local t: float = flows.times[i];
                local w: float = 0.0;
                local left: float = p > 0 ? pillars[p - 1] : 0.0;
                local right: float = p < (count - 1) ? pillars[p + 1] : 1000.0;
                if ((t <= pillars[p]) && (t >= left)) {
                    w = p == 0 ? 1.0 : (t - left) / (pillars[p] - left);
                } else if ((t > pillars[p]) && (t <= right)) {
                    w = p == (count - 1) ? 1.0 : (right - t) / (right - pillars[p]);
                }
                s = s + (flows.amounts[i] * curve.discount(t) * Math.exp(-0.0001 * w * t));
            }
            out[p] = s - base;
        }
    }
}
