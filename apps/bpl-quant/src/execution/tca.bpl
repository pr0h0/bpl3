# Execution planning and transaction cost analysis.
#
# Almgren-Chriss: optimal liquidation of X shares over N periods with
# linear temporary impact (eta), linear permanent impact (gamma), a fixed
# half-spread cost (epsilon), volatility sigma and risk aversion lambda.
# The trajectory is x_j = X sinh(kappa (T - t_j)) / sinh(kappa T); expected
# cost and variance follow in closed form, and sweeping lambda traces the
# efficient frontier.
#
# Square-root impact: cost(bps) = Y * sigma * sqrt(Q / ADV) * 1e4.
#
# Implementation shortfall: given a decision price, an arrival price and
# fills, the cost of executed shares relative to the decision price splits
# into delay (decision -> arrival), trading (arrival -> fills) and
# opportunity cost of the unexecuted remainder at the closing price.

import malloc, free from "std/c.bpl";
import [Math] from "std/math.bpl";

export [AlmgrenChriss];
export [AcParams];
export [AcPlan];
export [Impact];
export [Fill];
export [Shortfall];
export [TcaReport];
export [TcaCalc];

struct AcParams {
    shares: float,
    periods: int,
    horizon: float,
    sigma: float,
    eta: float,
    gamma: float,
    epsilon: float,
    lambda: float,
    price: float,
}

struct AcPlan {
    # holdings[0..N], trades[1..N] (trades[0] unused).
    holdings: *float,
    trades: *float,
    n: int,
    kappa: float,
    expected_cost: float,
    variance: float,
    half_life: float,

    frame destroy(this: *AcPlan) {
        free(cast<*void>(this.holdings));
        free(cast<*void>(this.trades));
    }

    frame utility(this: *AcPlan, lambda: float) ret float {
        return this.expected_cost + (lambda * this.variance);
    }
}

struct AlmgrenChriss {
    frame acosh(x: float) ret float {
        return Math.log(x + Math.sqrt((x * x) - 1.0));
    }

    frame sinh(x: float) ret float {
        return 0.5 * (Math.exp(x) - Math.exp(-x));
    }

    frame cosh(x: float) ret float {
        return 0.5 * (Math.exp(x) + Math.exp(-x));
    }

    # Expected cost and variance of any schedule `trades[1..n]` under the
    # model (holdings implied from the total).
    frame evaluate(p: *AcParams, trades: *float, n: int, cost: *float, variance: *float) {
        local tau: float = p.horizon / cast<float>(n);
        local x: float = p.shares;
        local c: float = 0.5 * p.gamma * p.shares * p.shares;
        local v: float = 0.0;
        local eta_t: float = p.eta - (0.5 * p.gamma * tau);
        loop (local k: int = 1; k <= n; k = k + 1) {
            local q: float = trades[k];
            c = c + (p.epsilon * Math.abs(q)) + ((eta_t / tau) * q * q);
            x = x - q;
            v = v + (p.sigma * p.sigma * tau * x * x);
        }
        *cost = c;
        *variance = v;
    }

    frame plan(p: *AcParams) ret AcPlan {
        local n: int = p.periods < 1 ? 1 : p.periods;
        local plan: AcPlan;
        plan.n = n;
        plan.holdings = cast<*float>(malloc(cast<long>(n + 1) * sizeof(float)));
        plan.trades = cast<*float>(malloc(cast<long>(n + 1) * sizeof(float)));
        local tau: float = p.horizon / cast<float>(n);
        local eta_t: float = p.eta - (0.5 * p.gamma * tau);
        plan.trades[0] = 0.0;
        if ((p.lambda <= 0.0) || (eta_t <= 0.0)) {
            # Risk neutral: straight-line (TWAP) schedule.
            plan.kappa = 0.0;
            loop (local k: int = 0; k <= n; k = k + 1) {
                plan.holdings[k] = p.shares * (1.0 - (cast<float>(k) / cast<float>(n)));
            }
        } else {
            local kappa_tilde2: float = (p.lambda * p.sigma * p.sigma) / eta_t;
            local kappa: float = AlmgrenChriss.acosh(1.0 + (0.5 * kappa_tilde2 * tau * tau)) / tau;
            plan.kappa = kappa;
            local denom: float = AlmgrenChriss.sinh(kappa * p.horizon);
            loop (local k: int = 0; k <= n; k = k + 1) {
                local t: float = cast<float>(k) * tau;
                plan.holdings[k] = (p.shares * AlmgrenChriss.sinh(kappa * (p.horizon - t))) / denom;
            }
        }
        plan.holdings[n] = 0.0;
        loop (local k: int = 1; k <= n; k = k + 1) {
            plan.trades[k] = plan.holdings[k - 1] - plan.holdings[k];
        }
        AlmgrenChriss.evaluate(p, plan.trades, n, &plan.expected_cost, &plan.variance);
        plan.half_life = plan.kappa > 0.0 ? 1.0 / plan.kappa : 1000000000.0;
        return plan;
    }

    # Efficient frontier: expected cost and stdev for `count` lambdas
    # spaced logarithmically in [lo, hi].
    frame frontier(p: *AcParams, lo: float, hi: float, count: int, costs: *float, stdevs: *float, lambdas: *float) {
        loop (local i: int = 0; i < count; i = i + 1) {
            local f: float = count == 1 ? 0.0 : cast<float>(i) / cast<float>(count - 1);
            local lambda: float = Math.exp(Math.log(lo) + (f * (Math.log(hi) - Math.log(lo))));
            local q: AcParams = *p;
            q.lambda = lambda;
            local plan: AcPlan = AlmgrenChriss.plan(&q);
            costs[i] = plan.expected_cost;
            stdevs[i] = Math.sqrt(plan.variance);
            lambdas[i] = lambda;
            plan.destroy();
        }
    }
}

struct Impact {
    # Square-root law, cost in basis points.
    frame squareRootBps(quantity: float, adv: float, daily_vol: float, y: float) ret float {
        if ((adv <= 0.0) || (quantity <= 0.0)) {
            return 0.0;
        }
        return y * daily_vol * Math.sqrt(quantity / adv) * 10000.0;
    }

    # Participation rate needed to finish `quantity` in `minutes` of a day
    # with `minutes_per_day` and volume `adv`.
    frame participation(quantity: float, adv: float, minutes: float, minutes_per_day: float) ret float {
        local window: float = adv * (minutes / minutes_per_day);
        return window > 0.0 ? quantity / window : 0.0;
    }
}

struct Fill {
    price: float,
    quantity: float,
    time: float,
}

struct Shortfall {
    executed: float,
    unexecuted: float,
    avg_price: float,
    paper_return: float,
    delay_cost: float,
    trading_cost: float,
    opportunity_cost: float,
    fees: float,
    total: float,
    total_bps: float,
}

struct TcaReport {
    vwap: float,
    vs_arrival_bps: float,
    vs_vwap_bps: float,
    vs_close_bps: float,
    participation: float,
    shortfall: Shortfall,
}

# `side` = +1 buy, -1 sell. Costs are positive when they hurt.
struct TcaCalc {
    frame shortfall(side: float, target: float, decision: float, arrival: float, close: float, fills: *Fill, n: int, fee_per_share: float) ret Shortfall {
        local s: Shortfall;
        local qty: float = 0.0;
        local notional: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            qty = qty + fills[i].quantity;
            notional = notional + (fills[i].price * fills[i].quantity);
        }
        s.executed = qty;
        s.unexecuted = Math.max(0.0, target - qty);
        s.avg_price = qty > 0.0 ? notional / qty : 0.0;
        s.delay_cost = side * (arrival - decision) * qty;
        s.trading_cost = side * (notional - (arrival * qty));
        s.opportunity_cost = side * (close - decision) * s.unexecuted;
        s.fees = fee_per_share * qty;
        s.total = s.delay_cost + s.trading_cost + s.opportunity_cost + s.fees;
        local paper: float = decision * target;
        s.paper_return = side * (close - decision) * target;
        s.total_bps = paper > 0.0 ? (s.total / paper) * 10000.0 : 0.0;
        return s;
    }

    frame report(side: float, target: float, decision: float, arrival: float, close: float, market_vwap: float, market_volume: float, fills: *Fill, n: int, fee_per_share: float) ret TcaReport {
        local r: TcaReport;
        r.shortfall = TcaCalc.shortfall(side, target, decision, arrival, close, fills, n, fee_per_share);
        local avg: float = r.shortfall.avg_price;
        r.vwap = avg;
        r.vs_arrival_bps = arrival > 0.0 ? ((side * (avg - arrival)) / arrival) * 10000.0 : 0.0;
        r.vs_vwap_bps = market_vwap > 0.0 ? ((side * (avg - market_vwap)) / market_vwap) * 10000.0 : 0.0;
        r.vs_close_bps = close > 0.0 ? ((side * (avg - close)) / close) * 10000.0 : 0.0;
        r.participation = market_volume > 0.0 ? r.shortfall.executed / market_volume : 0.0;
        return r;
    }
}
