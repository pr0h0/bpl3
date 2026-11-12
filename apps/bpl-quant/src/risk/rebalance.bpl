# Portfolio rebalancing to target weights.
#
# Rebalancer.plan() turns holdings, prices and targets into whole-lot
# trades: names inside their tolerance band are left alone, trades below
# the minimum value are skipped, buys are funded by sells plus cash after
# commissions, and turnover above the cap scales every trade down. The
# result reports trades, post-trade weights, turnover, costs and the cash
# left over.
#
# Rebalancer.simulate() replays a price path under a calendar (every N
# bars) or threshold (any weight outside the band) policy and reports
# tracking error to the target mix, turnover, costs and the number of
# rebalances, so the policies can be compared.

import malloc, free from "std/c.bpl";
import [Math] from "std/math.bpl";

export [Rebalancer];
export [RebalanceInput];
export [RebalancePlan];
export [PolicyResult];

struct RebalanceInput {
    count: int,
    shares: *float,
    prices: *float,
    targets: *float,
    lots: *float,
    cash: float,
    # Absolute weight band (0.02 = 2 percentage points); 0 always trades.
    band: float,
    min_trade: float,
    # Fraction of portfolio value; 0 = unlimited.
    max_turnover: float,
    commission_bps: float,
    # Keep this fraction of value in cash.
    cash_buffer: float,
}

struct RebalancePlan {
    count: int,
    trades: *float,
    post_shares: *float,
    pre_weights: *float,
    post_weights: *float,
    value: float,
    bought: float,
    sold: float,
    turnover: float,
    commission: float,
    cash_after: float,
    tracking_before: float,
    tracking_after: float,
    scaled_by: float,
    skipped_band: int,
    skipped_small: int,

    frame destroy(this: *RebalancePlan) {
        free(cast<*void>(this.trades));
        free(cast<*void>(this.post_shares));
        free(cast<*void>(this.pre_weights));
        free(cast<*void>(this.post_weights));
        this.count = 0;
    }
}

struct PolicyResult {
    rebalances: int,
    turnover: float,
    commission: float,
    tracking_error: float,
    max_drift: float,
    final_value: float,
    total_return: float,
}

struct Rebalancer {
    frame alloc(n: int) ret *float {
        local p: *float = cast<*float>(malloc(cast<long>(n + 1) * sizeof(float)));
        loop (local i: int = 0; i <= n; i = i + 1) {
            p[i] = 0.0;
        }
        return p;
    }

    # Root-sum-square distance between weights and targets.
    frame distance(w: *float, t: *float, n: int) ret float {
        local s: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            local d: float = w[i] - t[i];
            s = s + (d * d);
        }
        return Math.sqrt(s);
    }

    frame roundLots(qty: float, lot: float) ret float {
        local l: float = lot > 0.0 ? lot : 1.0;
        if (qty >= 0.0) {
            return Math.floor(qty / l) * l;
        }
        return -(Math.floor(-qty / l) * l);
    }

    frame plan(input: *RebalanceInput) ret RebalancePlan {
        local n: int = input.count;
        local p: RebalancePlan;
        p.count = n;
        p.trades = Rebalancer.alloc(n);
        p.post_shares = Rebalancer.alloc(n);
        p.pre_weights = Rebalancer.alloc(n);
        p.post_weights = Rebalancer.alloc(n);
        p.skipped_band = 0;
        p.skipped_small = 0;
        p.scaled_by = 1.0;
        local value: float = input.cash;
        loop (local i: int = 0; i < n; i = i + 1) {
            value = value + (input.shares[i] * input.prices[i]);
        }
        p.value = value;
        if (value <= 0.0) {
            p.bought = 0.0;
            p.sold = 0.0;
            p.turnover = 0.0;
            p.commission = 0.0;
            p.cash_after = input.cash;
            p.tracking_before = 0.0;
            p.tracking_after = 0.0;
            return p;
        }
        loop (local i: int = 0; i < n; i = i + 1) {
            p.pre_weights[i] = (input.shares[i] * input.prices[i]) / value;
        }
        p.tracking_before = Rebalancer.distance(p.pre_weights, input.targets, n);
        local investable: float = value * (1.0 - input.cash_buffer);
        # Desired trades, before lots, band and minimum size.
        local raw: *float = Rebalancer.alloc(n);
        loop (local i: int = 0; i < n; i = i + 1) {
            local drift: float = Math.abs(p.pre_weights[i] - input.targets[i]);
            if ((input.band > 0.0) && (drift <= input.band)) {
                p.skipped_band = p.skipped_band + 1;
                continue;
            }
            local want: float = (input.targets[i] * investable) / input.prices[i];
            raw[i] = want - input.shares[i];
            if ((Math.abs(raw[i]) * input.prices[i]) < input.min_trade) {
                raw[i] = 0.0;
                p.skipped_small = p.skipped_small + 1;
            }
        }
        # Turnover cap: one-way traded value over portfolio value.
        local gross: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            gross = gross + (Math.abs(raw[i]) * input.prices[i]);
        }
        local cap: float = input.max_turnover * value * 2.0;
        if ((input.max_turnover > 0.0) && (gross > cap)) {
            p.scaled_by = cap / gross;
            loop (local i: int = 0; i < n; i = i + 1) {
                raw[i] = raw[i] * p.scaled_by;
            }
        }
        local fee: float = input.commission_bps / 10000.0;
        p.sold = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            if (raw[i] < 0.0) {
                local q: float = Rebalancer.roundLots(raw[i], input.lots[i]);
                # Cannot sell more than held.
                if (-q > input.shares[i]) {
                    q = -input.shares[i];
                }
                p.trades[i] = q;
                p.sold = p.sold + (-q * input.prices[i]);
            }
        }
        local budget: float = (input.cash + (p.sold * (1.0 - fee))) - (value * input.cash_buffer);
        local wanted: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            if (raw[i] > 0.0) {
                wanted = wanted + (raw[i] * input.prices[i] * (1.0 + fee));
            }
        }
        local buy_scale: float = 1.0;
        if ((wanted > budget) && (wanted > 0.0)) {
            buy_scale = Math.max(0.0, budget / wanted);
        }
        p.bought = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            if (raw[i] > 0.0) {
                local q: float = Rebalancer.roundLots(raw[i] * buy_scale, input.lots[i]);
                p.trades[i] = q;
                p.bought = p.bought + (q * input.prices[i]);
            }
        }
        free(cast<*void>(raw));
        p.commission = (p.bought + p.sold) * fee;
        p.cash_after = (input.cash + p.sold) - p.bought - p.commission;
        p.turnover = (p.bought + p.sold) / (2.0 * value);
        local post_value: float = p.cash_after;
        loop (local i: int = 0; i < n; i = i + 1) {
            p.post_shares[i] = input.shares[i] + p.trades[i];
            post_value = post_value + (p.post_shares[i] * input.prices[i]);
        }
        loop (local i: int = 0; i < n; i = i + 1) {
            p.post_weights[i] = (p.post_shares[i] * input.prices[i]) / post_value;
        }
        p.tracking_after = Rebalancer.distance(p.post_weights, input.targets, n);
        return p;
    }

    # prices: `bars` rows of `n` prices (row-major). policy 0 = calendar
    # every `period` bars, 1 = threshold `band`.
    frame simulate(prices: *float, bars: int, n: int, targets: *float, start_value: float, policy: int, period: int, band: float, commission_bps: float) ret PolicyResult {
        local out: PolicyResult = PolicyResult { rebalances: 0, turnover: 0.0, commission: 0.0, tracking_error: 0.0, max_drift: 0.0, final_value: start_value, total_return: 0.0 };
        if ((bars < 1) || (n < 1)) {
            return out;
        }
        local shares: *float = Rebalancer.alloc(n);
        local weights: *float = Rebalancer.alloc(n);
        local fee: float = commission_bps / 10000.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            shares[i] = (targets[i] * start_value) / prices[i];
        }
        local cash: float = start_value;
        loop (local i: int = 0; i < n; i = i + 1) {
            cash = cash - (shares[i] * prices[i]);
        }
        local te_sum: float = 0.0;
        loop (local t: int = 1; t < bars; t = t + 1) {
            local row: *float = prices + (t * n);
            local value: float = cash;
            loop (local i: int = 0; i < n; i = i + 1) {
                value = value + (shares[i] * row[i]);
            }
            local max_drift: float = 0.0;
            loop (local i: int = 0; i < n; i = i + 1) {
                weights[i] = (shares[i] * row[i]) / value;
                max_drift = Math.max(max_drift, Math.abs(weights[i] - targets[i]));
            }
            out.max_drift = Math.max(out.max_drift, max_drift);
            local d: float = Rebalancer.distance(weights, targets, n);
            te_sum = te_sum + (d * d);
            local due: bool = policy == 0 ? (period > 0) && ((t % period) == 0) : max_drift > band;
            if (due) {
                local traded: float = 0.0;
                loop (local i: int = 0; i < n; i = i + 1) {
                    local want: float = (targets[i] * value) / row[i];
                    traded = traded + (Math.abs(want - shares[i]) * row[i]);
                    shares[i] = want;
                }
                local cost: float = traded * fee;
                # Costs come out pro rata so weights stay on target.
                loop (local i: int = 0; i < n; i = i + 1) {
                    shares[i] = shares[i] * (1.0 - (cost / value));
                }
                out.commission = out.commission + cost;
                out.turnover = out.turnover + (traded / (2.0 * value));
                out.rebalances = out.rebalances + 1;
            }
        }
        local last: *float = prices + ((bars - 1) * n);
        local final_value: float = cash;
        loop (local i: int = 0; i < n; i = i + 1) {
            final_value = final_value + (shares[i] * last[i]);
        }
        out.final_value = final_value;
        out.total_return = (final_value / start_value) - 1.0;
        out.tracking_error = Math.sqrt(te_sum / cast<float>(bars > 1 ? bars - 1 : 1));
        free(cast<*void>(shares));
        free(cast<*void>(weights));
        return out;
    }
}
