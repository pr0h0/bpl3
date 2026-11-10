# Credit and FX analytics.
#
# Credit: piecewise-constant hazard curves bootstrapped from CDS par
# spreads, CDS mark-to-market and risky annuities, Merton's structural model
# (equity as a call on assets) and the Vasicek one-factor portfolio loss
# distribution. FX: covered-interest-parity forwards, Garman-Kohlhagen
# options and a quanto drift adjustment.

import malloc, free from "std/c.bpl";
import [Math] from "std/math.bpl";
import [Special] from "../math/special.bpl";
import [Optimize], [RootResult] from "../math/optimize.bpl";
import [OptionSpec], [OptionKind], [BlackScholes] from "./black_scholes.bpl";
import [DiscountCurve] from "../rates/curve.bpl";

export [HazardCurve];
export [Cds];
export [CdsValue];
export [Merton];
export [MertonResult];
export [Vasicek1F];
export [Fx];

struct HazardCurve {
    times: *float,
    hazards: *float,
    n: int,
    recovery: float,

    frame new(capacity: int, recovery: float) ret HazardCurve {
        return HazardCurve { times: cast<*float>(malloc(cast<long>(capacity) * sizeof(float))), hazards: cast<*float>(malloc(cast<long>(capacity) * sizeof(float))), n: 0, recovery: recovery };
    }

    frame destroy(this: *HazardCurve) {
        free(cast<*void>(this.times));
        free(cast<*void>(this.hazards));
    }

    # Survival probability Q(t) = exp(-integral of the hazard rate).
    frame survival(this: *HazardCurve, t: float) ret float {
        local integral: float = 0.0;
        local prev: float = 0.0;
        loop (local i: int = 0; i < this.n; i = i + 1) {
            local end: float = Math.min(t, this.times[i]);
            if (end > prev) {
                integral = integral + (this.hazards[i] * (end - prev));
            }
            prev = this.times[i];
            if (t <= this.times[i]) {
                return Math.exp(-integral);
            }
        }
        if ((this.n > 0) && (t > prev)) {
            integral = integral + (this.hazards[this.n - 1] * (t - prev));
        }
        return Math.exp(-integral);
    }

    frame defaultProbability(this: *HazardCurve, t: float) ret float {
        return 1.0 - this.survival(t);
    }
}

struct CdsValue {
    premium_leg: float,
    protection_leg: float,
    risky_annuity: float,
    par_spread: float,
    mtm: float,
}

struct Cds {
    # Values a CDS paying `spread` quarterly to `maturity` (accrual on default ignored).
    frame value(h: *HazardCurve, curve: *DiscountCurve, maturity: float, spread: float, notional: float) ret CdsValue {
        local v: CdsValue;
        local dt: float = 0.25;
        local annuity: float = 0.0;
        local protection: float = 0.0;
        local t: float = dt;
        local prev_q: float = 1.0;
        loop (t <= (maturity + 0.0000001)) {
            local q: float = h.survival(t);
            local df: float = curve.discount(t);
            annuity = annuity + (dt * df * 0.5 * (q + prev_q));
            protection = protection + ((1.0 - h.recovery) * df * (prev_q - q));
            prev_q = q;
            t = t + dt;
        }
        v.risky_annuity = annuity;
        v.premium_leg = spread * annuity * notional;
        v.protection_leg = protection * notional;
        v.par_spread = annuity > 0.0 ? protection / annuity : 0.0;
        v.mtm = v.protection_leg - v.premium_leg;
        return v;
    }

    # Bootstraps hazards so each quoted par spread reprices exactly.
    frame bootstrap(curve: *DiscountCurve, maturities: *float, spreads: *float, n: int, recovery: float) ret HazardCurve {
        local h: HazardCurve = HazardCurve.new(n, recovery);
        loop (local i: int = 0; i < n; i = i + 1) {
            h.times[i] = maturities[i];
            h.hazards[i] = spreads[i] / (1.0 - recovery);
            h.n = i + 1;
            local hp: *HazardCurve = &h;
            local target: float = spreads[i];
            local mat: float = maturities[i];
            local idx: int = i;
            local objective: Lambda<float>(float) = |lambda: float| ret float {
                hp.hazards[idx] = lambda;
                local v: CdsValue = Cds.value(hp, curve, mat, target, 1.0);
                return v.par_spread - target;
            };
            local r: RootResult = Optimize.brent(objective, 0.0000001, 5.0, 0.000000000001, 200);
            h.hazards[i] = r.x;
        }
        return h;
    }
}

struct MertonResult {
    asset_value: float,
    asset_vol: float,
    distance_to_default: float,
    default_probability: float,
    credit_spread: float,
    converged: bool,
}

struct Merton {
    # Solves for asset value and volatility from equity value/vol and debt face.
    frame solve(equity: float, equity_vol: float, debt: float, rate: float, t: float) ret MertonResult {
        local va: float = equity + (debt * Math.exp(-rate * t));
        local sa: float = (equity_vol * equity) / va;
        local converged: bool = false;
        loop (local it: int = 0; it < 200; it = it + 1) {
            local sqt: float = Math.sqrt(t);
            local d1: float = (Math.log(va / debt) + ((rate + (0.5 * sa * sa)) * t)) / (sa * sqt);
            local d2: float = d1 - (sa * sqt);
            local nd1: float = Special.normCdf(d1);
            # Fixed point on E = V N(d1) - D e^{-rT} N(d2) and sigma_E E = N(d1) sigma_V V.
            local va_next: float = (equity + (debt * Math.exp(-rate * t) * Special.normCdf(d2))) / nd1;
            local sa_next: float = (equity_vol * equity) / (nd1 * va_next);
            local change: float = (Math.abs(va_next - va) / va) + Math.abs(sa_next - sa);
            va = va_next;
            sa = sa_next;
            if (change < 0.000000000001) {
                converged = true;
                break;
            }
        }
        local sqt: float = Math.sqrt(t);
        local d2: float = (Math.log(va / debt) + ((rate - (0.5 * sa * sa)) * t)) / (sa * sqt);
        local debt_value: float = va - equity;
        local y: float = -Math.log(debt_value / debt) / t;
        return MertonResult { asset_value: va, asset_vol: sa, distance_to_default: d2, default_probability: Special.normCdf(-d2), credit_spread: y - rate, converged: converged };
    }
}

struct Vasicek1F {
    # Loss quantile of a large homogeneous portfolio (Basel IRB formula).
    frame lossQuantile(pd: float, rho: float, lgd: float, q: float) ret float {
        local num: float = Special.invNormCdf(pd) + (Math.sqrt(rho) * Special.invNormCdf(q));
        return lgd * Special.normCdf(num / Math.sqrt(1.0 - rho));
    }

    # Expected loss is pd * lgd regardless of correlation.
    frame expectedLoss(pd: float, lgd: float) ret float {
        return pd * lgd;
    }
}

struct Fx {
    # Covered interest parity forward (domestic per foreign).
    frame forward(spot: float, rd: float, rf: float, t: float) ret float {
        return spot * Math.exp((rd - rf) * t);
    }

    frame forwardPoints(spot: float, rd: float, rf: float, t: float, pip: float) ret float {
        return (Fx.forward(spot, rd, rf, t) - spot) / pip;
    }

    # Garman-Kohlhagen is Black-Scholes with the foreign rate as dividend yield.
    frame option(is_call: bool, spot: float, strike: float, rd: float, rf: float, vol: float, t: float) ret float {
        local sp: OptionSpec = OptionSpec.new(is_call ? OptionKind.Call : OptionKind.Put, spot, strike, rd, rf, vol, t);
        return BlackScholes.price(&sp);
    }

    # Drift adjustment for an asset paying in a foreign currency settled domestically.
    frame quantoDrift(rf: float, rho: float, asset_vol: float, fx_vol: float) ret float {
        return rf - (rho * asset_vol * fx_vol);
    }

    # Triangular arbitrage residual for three quotes (should be ~0).
    frame triangularResidual(ab: float, bc: float, ac: float) ret float {
        return ((ab * bc) / ac) - 1.0;
    }
}
