# Multi-leg option strategies.
#
# A Strategy is a set of legs (calls, puts and the underlying) on one
# underlying. It reports the payoff at the first expiry, P&L at any horizon
# under Black-Scholes, breakevens, maximum profit and loss (with unbounded
# tails detected from the slope beyond the outermost strike), probability
# of profit and expected P&L under the risk-neutral lognormal law, and net
# Greeks. Premiums are Black-Scholes values unless a leg gives its own.

import [Math] from "std/math.bpl";
import [Text] from "../core/text.bpl";
import [OptionSpec], [OptionKind], [Greeks], [BlackScholes] from "./black_scholes.bpl";

export [Strategy];
export [Leg];
export [LegKind];
export [StrategyStats];

global const MAX_LEGS: int = 8;

enum LegKind {
    Call,
    Put,
    Stock,
}

struct Leg {
    kind: LegKind,
    strike: float,
    expiry: float,
    quantity: float,
    premium: float,
}

struct StrategyStats {
    cost: float,
    max_profit: float,
    max_loss: float,
    profit_unbounded: bool,
    loss_unbounded: bool,
    breakevens: float[8],
    breakeven_count: int,
    probability_of_profit: float,
    expected_pnl: float,
    delta: float,
    gamma: float,
    vega: float,
    theta: float,
}

struct Strategy {
    name: string,
    spot: float,
    vol: float,
    rate: float,
    dividend: float,
    legs: Leg[8],
    count: int,

    frame create(name: string, spot: float, vol: float, rate: float, dividend: float) ret Strategy {
        local s: Strategy;
        s.name = name;
        s.spot = spot;
        s.vol = vol;
        s.rate = rate;
        s.dividend = dividend;
        s.count = 0;
        return s;
    }

    frame legSpec(this: *Strategy, leg: *Leg, spot: float, elapsed: float) ret OptionSpec {
        local kind: OptionKind = leg.kind == LegKind.Call ? OptionKind.Call : OptionKind.Put;
        return OptionSpec.new(kind, spot, leg.strike, this.rate, this.dividend, this.vol, leg.expiry - elapsed);
    }

    # Adds a leg; a negative premium asks for the Black-Scholes value.
    frame add(this: *Strategy, kind: LegKind, strike: float, expiry: float, quantity: float, premium: float) ret bool {
        if (this.count == MAX_LEGS) {
            return false;
        }
        local leg: Leg = Leg { kind: kind, strike: strike, expiry: expiry, quantity: quantity, premium: premium };
        if (premium < 0.0) {
            if (kind == LegKind.Stock) {
                leg.premium = this.spot;
            } else {
                local s: OptionSpec = this.legSpec(&leg, this.spot, 0.0);
                leg.premium = BlackScholes.price(&s);
            }
        }
        this.legs[this.count] = leg;
        this.count = this.count + 1;
        return true;
    }

    frame firstExpiry(this: *Strategy) ret float {
        local t: float = -1.0;
        loop (local i: int = 0; i < this.count; i = i + 1) {
            local leg: *Leg = &this.legs[i];
            if ((leg.kind != LegKind.Stock) && ((t < 0.0) || (leg.expiry < t))) {
                t = leg.expiry;
            }
        }
        return t < 0.0 ? 1.0 : t;
    }

    # Net premium paid (negative = credit received).
    frame cost(this: *Strategy) ret float {
        local c: float = 0.0;
        loop (local i: int = 0; i < this.count; i = i + 1) {
            c = c + (this.legs[i].quantity * this.legs[i].premium);
        }
        return c;
    }

    # Value of all legs at `spot` after `elapsed` years; legs that expired
    # are worth their intrinsic value.
    frame value(this: *Strategy, spot: float, elapsed: float) ret float {
        local v: float = 0.0;
        loop (local i: int = 0; i < this.count; i = i + 1) {
            local leg: *Leg = &this.legs[i];
            if (leg.kind == LegKind.Stock) {
                v = v + (leg.quantity * spot);
                continue;
            }
            local remaining: float = leg.expiry - elapsed;
            if (remaining <= 0.0000001) {
                local intrinsic: float = leg.kind == LegKind.Call ? Math.max(spot - leg.strike, 0.0) : Math.max(leg.strike - spot, 0.0);
                v = v + (leg.quantity * intrinsic);
            } else {
                local s: OptionSpec = this.legSpec(leg, spot, elapsed);
                v = v + (leg.quantity * BlackScholes.price(&s));
            }
        }
        return v;
    }

    frame pnl(this: *Strategy, spot: float, elapsed: float) ret float {
        return this.value(spot, elapsed) - this.cost();
    }

    # P&L at the first expiry.
    frame payoff(this: *Strategy, spot: float) ret float {
        return this.pnl(spot, this.firstExpiry());
    }

    # Slope of the expiry payoff above the highest strike (number of net
    # long calls plus stock); below the lowest strike the slope is minus
    # the net long puts plus stock.
    frame upperSlope(this: *Strategy) ret float {
        local s: float = 0.0;
        loop (local i: int = 0; i < this.count; i = i + 1) {
            if ((this.legs[i].kind == LegKind.Call) || (this.legs[i].kind == LegKind.Stock)) {
                s = s + this.legs[i].quantity;
            }
        }
        return s;
    }

    frame lowerSlope(this: *Strategy) ret float {
        local s: float = 0.0;
        loop (local i: int = 0; i < this.count; i = i + 1) {
            if (this.legs[i].kind == LegKind.Put) {
                s = s - this.legs[i].quantity;
            } else if (this.legs[i].kind == LegKind.Stock) {
                s = s + this.legs[i].quantity;
            }
        }
        return s;
    }

    frame strikeRange(this: *Strategy, lo: *float, hi: *float) {
        *lo = this.spot;
        *hi = this.spot;
        loop (local i: int = 0; i < this.count; i = i + 1) {
            if (this.legs[i].kind != LegKind.Stock) {
                *lo = Math.min(*lo, this.legs[i].strike);
                *hi = Math.max(*hi, this.legs[i].strike);
            }
        }
    }

    frame analyse(this: *Strategy) ret StrategyStats {
        local st: StrategyStats;
        st.cost = this.cost();
        st.breakeven_count = 0;
        local lo: float = 0.0;
        local hi: float = 0.0;
        this.strikeRange(&lo, &hi);
        local t: float = this.firstExpiry();
        # Scan from 0 to well above the highest strike.
        local top: float = Math.max(hi * 3.0, this.spot * 4.0);
        local steps: int = 4000;
        local best: float = -1000000000000000000000.0;
        local worst: float = 1000000000000000000000.0;
        local prev_x: float = 0.0;
        local prev_v: float = this.payoff(0.0);
        loop (local i: int = 0; i <= steps; i = i + 1) {
            local x: float = (top * cast<float>(i)) / cast<float>(steps);
            local v: float = this.payoff(x);
            best = Math.max(best, v);
            worst = Math.min(worst, v);
            if ((i > 0) && (st.breakeven_count < 8) && (((prev_v < 0.0) && (v >= 0.0)) || ((prev_v >= 0.0) && (v < 0.0)))) {
                st.breakevens[st.breakeven_count] = this.refine(prev_x, x);
                st.breakeven_count = st.breakeven_count + 1;
            }
            prev_x = x;
            prev_v = v;
        }
        local up: float = this.upperSlope();
        st.profit_unbounded = up > 0.0000001;
        st.loss_unbounded = up < -0.0000001;
        st.max_profit = st.profit_unbounded ? 1000000000000000000000.0 : best;
        st.max_loss = st.loss_unbounded ? -1000000000000000000000.0 : worst;
        # Risk-neutral lognormal expectation at the first expiry.
        local drift: float = (this.rate - this.dividend - (0.5 * this.vol * this.vol)) * t;
        local sd: float = this.vol * Math.sqrt(t);
        local n: int = 2001;
        local prob: float = 0.0;
        local mean: float = 0.0;
        local total_w: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            local z: float = -8.0 + ((16.0 * cast<float>(i)) / cast<float>(n - 1));
            local w: float = Math.exp(-0.5 * z * z);
            local x: float = this.spot * Math.exp(drift + (sd * z));
            local v: float = this.payoff(x);
            total_w = total_w + w;
            mean = mean + (w * v);
            if (v > 0.0) {
                prob = prob + w;
            }
        }
        st.probability_of_profit = prob / total_w;
        st.expected_pnl = mean / total_w;
        st.delta = 0.0;
        st.gamma = 0.0;
        st.vega = 0.0;
        st.theta = 0.0;
        loop (local i: int = 0; i < this.count; i = i + 1) {
            local leg: *Leg = &this.legs[i];
            if (leg.kind == LegKind.Stock) {
                st.delta = st.delta + leg.quantity;
                continue;
            }
            local s: OptionSpec = this.legSpec(leg, this.spot, 0.0);
            local g: Greeks = BlackScholes.greeks(&s);
            st.delta = st.delta + (leg.quantity * g.delta);
            st.gamma = st.gamma + (leg.quantity * g.gamma);
            st.vega = st.vega + (leg.quantity * g.vega);
            st.theta = st.theta + (leg.quantity * g.theta);
        }
        return st;
    }

    # Bisection for the payoff root in [a, b].
    frame refine(this: *Strategy, a0: float, b0: float) ret float {
        local a: float = a0;
        local b: float = b0;
        local fa: float = this.payoff(a);
        loop (local i: int = 0; i < 80; i = i + 1) {
            local m: float = 0.5 * (a + b);
            local fm: float = this.payoff(m);
            if ((fa < 0.0) == (fm < 0.0)) {
                a = m;
                fa = fm;
            } else {
                b = m;
            }
        }
        return 0.5 * (a + b);
    }

    # Named templates around `spot`; `width` is the strike spacing.
    frame template(name: string, spot: float, vol: float, rate: float, expiry: float, width: float, out: *Strategy) ret bool {
        *out = Strategy.create(name, spot, vol, rate, 0.0);
        local k: float = Math.floor((spot / width) + 0.5) * width;
        if (Text.equals(name, "long_straddle")) {
            out.add(LegKind.Call, k, expiry, 1.0, -1.0);
            out.add(LegKind.Put, k, expiry, 1.0, -1.0);
        } else if (Text.equals(name, "short_strangle")) {
            out.add(LegKind.Call, k + width, expiry, -1.0, -1.0);
            out.add(LegKind.Put, k - width, expiry, -1.0, -1.0);
        } else if (Text.equals(name, "bull_call_spread")) {
            out.add(LegKind.Call, k, expiry, 1.0, -1.0);
            out.add(LegKind.Call, k + width, expiry, -1.0, -1.0);
        } else if (Text.equals(name, "bear_put_spread")) {
            out.add(LegKind.Put, k, expiry, 1.0, -1.0);
            out.add(LegKind.Put, k - width, expiry, -1.0, -1.0);
        } else if (Text.equals(name, "iron_condor")) {
            out.add(LegKind.Put, k - (2.0 * width), expiry, 1.0, -1.0);
            out.add(LegKind.Put, k - width, expiry, -1.0, -1.0);
            out.add(LegKind.Call, k + width, expiry, -1.0, -1.0);
            out.add(LegKind.Call, k + (2.0 * width), expiry, 1.0, -1.0);
        } else if (Text.equals(name, "butterfly")) {
            out.add(LegKind.Call, k - width, expiry, 1.0, -1.0);
            out.add(LegKind.Call, k, expiry, -2.0, -1.0);
            out.add(LegKind.Call, k + width, expiry, 1.0, -1.0);
        } else if (Text.equals(name, "covered_call")) {
            out.add(LegKind.Stock, 0.0, 0.0, 1.0, -1.0);
            out.add(LegKind.Call, k + width, expiry, -1.0, -1.0);
        } else if (Text.equals(name, "collar")) {
            out.add(LegKind.Stock, 0.0, 0.0, 1.0, -1.0);
            out.add(LegKind.Put, k - width, expiry, 1.0, -1.0);
            out.add(LegKind.Call, k + width, expiry, -1.0, -1.0);
        } else if (Text.equals(name, "risk_reversal")) {
            out.add(LegKind.Put, k - width, expiry, -1.0, -1.0);
            out.add(LegKind.Call, k + width, expiry, 1.0, -1.0);
        } else if (Text.equals(name, "calendar")) {
            out.add(LegKind.Call, k, expiry, -1.0, -1.0);
            out.add(LegKind.Call, k, expiry * 2.0, 1.0, -1.0);
        } else {
            return false;
        }
        return true;
    }

    frame templateCount() ret int {
        return 10;
    }

    frame templateName(i: int) ret string {
        local names: string[10] = ["long_straddle", "short_strangle", "bull_call_spread", "bear_put_spread", "iron_condor", "butterfly", "covered_call", "collar", "risk_reversal", "calendar"];
        return names[i];
    }

    frame kindName(k: LegKind) ret string {
        if (k == LegKind.Call) {
            return "call";
        }
        if (k == LegKind.Put) {
            return "put";
        }
        return "stock";
    }
}
