# Black-Scholes-Merton pricing for European options with continuous dividend
# yield, analytic Greeks, Black-76 for futures, and digital/gap options.

import [Math] from "std/math.bpl";
import [Special] from "../math/special.bpl";

export [OptionKind];
export [OptionSpec];
export [Greeks];
export [BlackScholes];

enum OptionKind {
    Call,
    Put,
}

struct OptionSpec {
    kind: OptionKind,
    spot: float,
    strike: float,
    rate: float,
    dividend: float,
    vol: float,
    expiry: float,

    frame new(kind: OptionKind, spot: float, strike: float, rate: float, dividend: float, vol: float, expiry: float) ret OptionSpec {
        return OptionSpec { kind: kind, spot: spot, strike: strike, rate: rate, dividend: dividend, vol: vol, expiry: expiry };
    }

    frame isCall(this: *OptionSpec) ret bool {
        return this.kind == OptionKind.Call;
    }

    frame withVol(this: *OptionSpec, vol: float) ret OptionSpec {
        local s: OptionSpec = *this;
        s.vol = vol;
        return s;
    }

    frame withSpot(this: *OptionSpec, spot: float) ret OptionSpec {
        local s: OptionSpec = *this;
        s.spot = spot;
        return s;
    }

    frame withExpiry(this: *OptionSpec, expiry: float) ret OptionSpec {
        local s: OptionSpec = *this;
        s.expiry = expiry;
        return s;
    }

    frame withRate(this: *OptionSpec, rate: float) ret OptionSpec {
        local s: OptionSpec = *this;
        s.rate = rate;
        return s;
    }

    # Returns an error message, or nullptr when the sp is valid.
    frame validate(this: *OptionSpec) ret string {
        if (!(this.spot > 0.0)) {
            return "spot must be positive";
        }
        if (!(this.strike > 0.0)) {
            return "strike must be positive";
        }
        if (!(this.vol > 0.0) || (this.vol > 10.0)) {
            return "vol must be in (0, 10]";
        }
        if (!(this.expiry > 0.0) || (this.expiry > 100.0)) {
            return "expiry must be in (0, 100] years";
        }
        if ((this.rate < -1.0) || (this.rate > 1.0)) {
            return "rate must be in [-1, 1]";
        }
        if ((this.dividend < -1.0) || (this.dividend > 1.0)) {
            return "dividend must be in [-1, 1]";
        }
        return nullptr;
    }
}

struct Greeks {
    price: float,
    delta: float,
    gamma: float,
    vega: float,
    theta: float,
    rho: float,
    vanna: float,
    volga: float,
    charm: float,
    speed: float,
    zomma: float,
    color: float,
    epsilon: float,
    lambda: float,
}

struct BlackScholes {
    frame d1(s: *OptionSpec) ret float {
        return (Math.log(s.spot / s.strike) + (((s.rate - s.dividend) + (0.5 * s.vol * s.vol)) * s.expiry)) / (s.vol * Math.sqrt(s.expiry));
    }

    frame d2(s: *OptionSpec) ret float {
        return BlackScholes.d1(s) - (s.vol * Math.sqrt(s.expiry));
    }

    frame price(s: *OptionSpec) ret float {
        local d1: float = BlackScholes.d1(s);
        local d2: float = d1 - (s.vol * Math.sqrt(s.expiry));
        local df: float = Math.exp(-s.rate * s.expiry);
        local qf: float = Math.exp(-s.dividend * s.expiry);
        if (s.isCall()) {
            return (s.spot * qf * Special.normCdf(d1)) - (s.strike * df * Special.normCdf(d2));
        }
        return (s.strike * df * Special.normCdf(-d2)) - (s.spot * qf * Special.normCdf(-d1));
    }

    frame greeks(s: *OptionSpec) ret Greeks {
        local g: Greeks;
        local sqt: float = Math.sqrt(s.expiry);
        local d1: float = BlackScholes.d1(s);
        local d2: float = d1 - (s.vol * sqt);
        local df: float = Math.exp(-s.rate * s.expiry);
        local qf: float = Math.exp(-s.dividend * s.expiry);
        local pdf1: float = Special.normPdf(d1);
        local nd1: float = Special.normCdf(d1);
        local nd2: float = Special.normCdf(d2);
        g.price = BlackScholes.price(s);
        g.gamma = (qf * pdf1) / (s.spot * s.vol * sqt);
        g.vega = (s.spot * qf * pdf1 * sqt) / 100.0;
        g.vanna = (-qf * pdf1 * d2) / s.vol;
        g.volga = (s.spot * qf * pdf1 * sqt * d1 * d2) / s.vol / 100.0;
        g.speed = (-g.gamma / s.spot) * ((d1 / (s.vol * sqt)) + 1.0);
        g.zomma = (g.gamma * ((d1 * d2) - 1.0)) / s.vol;
        local common_theta: float = (-s.spot * qf * pdf1 * s.vol) / (2.0 * sqt);
        local color_term: float = (2.0 * (s.rate - s.dividend) * s.expiry) - (d2 * s.vol * sqt);
        g.color = (((-qf * pdf1) / (2.0 * s.spot * s.expiry * s.vol * sqt)) * ((2.0 * s.dividend * s.expiry) + 1.0 + ((color_term / (s.vol * sqt)) * d1))) / 365.0;
        if (s.isCall()) {
            g.delta = qf * nd1;
            g.theta = ((common_theta - (s.rate * s.strike * df * nd2)) + (s.dividend * s.spot * qf * nd1)) / 365.0;
            g.rho = (s.strike * s.expiry * df * nd2) / 100.0;
            g.epsilon = (-s.spot * s.expiry * qf * nd1) / 100.0;
            g.charm = (qf * ((s.dividend * nd1) - ((pdf1 * ((2.0 * (s.rate - s.dividend) * s.expiry) - (d2 * s.vol * sqt))) / (2.0 * s.expiry * s.vol * sqt)))) / 365.0;
        } else {
            g.delta = qf * (nd1 - 1.0);
            g.theta = ((common_theta + (s.rate * s.strike * df * Special.normCdf(-d2))) - (s.dividend * s.spot * qf * Special.normCdf(-d1))) / 365.0;
            g.rho = (-s.strike * s.expiry * df * Special.normCdf(-d2)) / 100.0;
            g.epsilon = (s.spot * s.expiry * qf * Special.normCdf(-d1)) / 100.0;
            g.charm = (qf * ((-s.dividend * Special.normCdf(-d1)) - ((pdf1 * ((2.0 * (s.rate - s.dividend) * s.expiry) - (d2 * s.vol * sqt))) / (2.0 * s.expiry * s.vol * sqt)))) / 365.0;
        }
        g.lambda = g.price > 0.0 ? (g.delta * s.spot) / g.price : 0.0;
        return g;
    }

    # Finite-difference Greeks, used by the self-test to validate the analytic ones.
    frame numericDelta(s: *OptionSpec, h: float) ret float {
        local up: OptionSpec = s.withSpot(s.spot * (1.0 + h));
        local dn: OptionSpec = s.withSpot(s.spot * (1.0 - h));
        return (BlackScholes.price(&up) - BlackScholes.price(&dn)) / (2.0 * s.spot * h);
    }

    frame numericGamma(s: *OptionSpec, h: float) ret float {
        local up: OptionSpec = s.withSpot(s.spot * (1.0 + h));
        local dn: OptionSpec = s.withSpot(s.spot * (1.0 - h));
        local ds: float = s.spot * h;
        return ((BlackScholes.price(&up) - (2.0 * BlackScholes.price(s))) + BlackScholes.price(&dn)) / (ds * ds);
    }

    frame numericVega(s: *OptionSpec, h: float) ret float {
        local up: OptionSpec = s.withVol(s.vol + h);
        local dn: OptionSpec = s.withVol(s.vol - h);
        return (BlackScholes.price(&up) - BlackScholes.price(&dn)) / (2.0 * h) / 100.0;
    }

    # Black-76 on a forward/futures price.
    frame black76(is_call: bool, forward: float, strike: float, rate: float, vol: float, expiry: float) ret float {
        local sqt: float = Math.sqrt(expiry);
        local d1: float = (Math.log(forward / strike) + (0.5 * vol * vol * expiry)) / (vol * sqt);
        local d2: float = d1 - (vol * sqt);
        local df: float = Math.exp(-rate * expiry);
        if (is_call) {
            return df * ((forward * Special.normCdf(d1)) - (strike * Special.normCdf(d2)));
        }
        return df * ((strike * Special.normCdf(-d2)) - (forward * Special.normCdf(-d1)));
    }

    # Cash-or-nothing digital paying `cash` if the option finishes in the money.
    frame digital(s: *OptionSpec, cash: float) ret float {
        local d2: float = BlackScholes.d2(s);
        local df: float = Math.exp(-s.rate * s.expiry);
        if (s.isCall()) {
            return cash * df * Special.normCdf(d2);
        }
        return cash * df * Special.normCdf(-d2);
    }

    # Asset-or-nothing digital.
    frame assetOrNothing(s: *OptionSpec) ret float {
        local d1: float = BlackScholes.d1(s);
        local qf: float = Math.exp(-s.dividend * s.expiry);
        if (s.isCall()) {
            return s.spot * qf * Special.normCdf(d1);
        }
        return s.spot * qf * Special.normCdf(-d1);
    }

    # Put-call parity residual C - P - (S e^{-qT} - K e^{-rT}); should be ~0.
    frame parityResidual(s: *OptionSpec) ret float {
        local c: OptionSpec = *s;
        c.kind = OptionKind.Call;
        local p: OptionSpec = *s;
        p.kind = OptionKind.Put;
        local lhs: float = BlackScholes.price(&c) - BlackScholes.price(&p);
        local rhs: float = (s.spot * Math.exp(-s.dividend * s.expiry)) - (s.strike * Math.exp(-s.rate * s.expiry));
        return lhs - rhs;
    }

    # Margrabe exchange option: right to exchange asset 2 for asset 1.
    frame margrabe(s1: float, s2: float, q1: float, q2: float, vol1: float, vol2: float, rho: float, expiry: float) ret float {
        local v: float = Math.sqrt(((vol1 * vol1) + (vol2 * vol2)) - (2.0 * rho * vol1 * vol2));
        local sqt: float = Math.sqrt(expiry);
        local d1: float = (Math.log(s1 / s2) + (((q2 - q1) + (0.5 * v * v)) * expiry)) / (v * sqt);
        local d2: float = d1 - (v * sqt);
        return (s1 * Math.exp(-q1 * expiry) * Special.normCdf(d1)) - (s2 * Math.exp(-q2 * expiry) * Special.normCdf(d2));
    }

    # Kirk's approximation for a spread option on two futures.
    frame kirkSpread(f1: float, f2: float, strike: float, vol1: float, vol2: float, rho: float, rate: float, expiry: float) ret float {
        local f2k: float = f2 + strike;
        local w: float = f2 / f2k;
        local v: float = Math.sqrt(((vol1 * vol1) - (2.0 * rho * vol1 * vol2 * w)) + (vol2 * vol2 * w * w));
        local sqt: float = Math.sqrt(expiry);
        local d1: float = (Math.log(f1 / f2k) + (0.5 * v * v * expiry)) / (v * sqt);
        local d2: float = d1 - (v * sqt);
        return Math.exp(-rate * expiry) * ((f1 * Special.normCdf(d1)) - (f2k * Special.normCdf(d2)));
    }

    # Brenner-Subrahmanyam style starting guess for implied volatility.
    frame volGuess(s: *OptionSpec, target: float) ret float {
        local fwd: float = s.spot * Math.exp((s.rate - s.dividend) * s.expiry);
        local df: float = Math.exp(-s.rate * s.expiry);
        local k: float = s.strike * df;
        local base: float = target - ((s.isCall() ? (s.spot - k) : (k - s.spot)) / 2.0);
        local guess: float = (Math.sqrt((2.0 * 3.14159265358979) / s.expiry) * (base)) / (fwd * df);
        if (!(guess > 0.01) || (guess > 5.0)) {
            guess = 0.3;
        }
        return guess;
    }
}
