# Pre-trade risk checks and post-trade exposure tracking.
#
# Every order passes an ordered list of rules before it reaches the engine:
# kill switch, restricted symbols, order size, order notional, price collar
# against the reference/last price, open-order count, an order-rate token
# bucket, worst-case position (current position plus all open orders on the
# same side) and gross open notional per account. Accepted orders are
# tracked so fills and cancels release their exposure; positions and
# realized cash come from the trade tape. A breach log keeps the most
# recent rejections for the API.

import malloc, free from "std/c.bpl";
import [LongMap] from "../core/hashmap.bpl";
import [Engine], [OrderRequest], [ExecReport] from "../market/engine.bpl";
import [Order], [Trade], [Side], [OrderType], [Ticks] from "../market/order.bpl";
import [OrderBook] from "../market/book.bpl";

export [RiskEngine];
export [RiskRule];
export [AccountLimits];
export [RiskDecision];
export [RiskBreach];
export [RiskExposure];

enum RiskRule {
    Pass,
    KillSwitch,
    Restricted,
    OrderQuantity,
    OrderNotional,
    PriceCollar,
    OpenOrders,
    OrderRate,
    Position,
    GrossNotional,
    LossLimit,
}

struct AccountLimits {
    max_order_qty: long,
    # Notional limits are in currency units.
    max_order_notional: float,
    max_position: long,
    max_gross_notional: float,
    max_open_orders: int,
    # Token bucket: `rate_per_sec` refill, `burst` capacity.
    rate_per_sec: float,
    burst: float,
    collar_bps: long,
    max_loss: float,
}

struct RiskDecision {
    rule: RiskRule,
    message: string,
    # Value that breached and the limit it breached.
    value: float,
    limit: float,
}

struct RiskBreach {
    account: int,
    symbol: int,
    rule: RiskRule,
    value: float,
    limit: float,
    time_ms: long,
}

# Per (account, symbol) exposure.
struct RiskExposure {
    account: int,
    symbol: int,
    position: long,
    open_buy: long,
    open_sell: long,
    cash: float,
    traded: long,
    last_price: long,
}

# Per-account state.
struct RiskAccount {
    limits: AccountLimits,
    killed: bool,
    tokens: float,
    last_refill_ms: long,
    open_orders: int,
    open_notional: float,
    checks: long,
    rejects: long,
}

# One accepted order whose remaining quantity still counts as exposure.
struct TrackedOrder {
    order_id: long,
    account: int,
    symbol: int,
    buy: bool,
    remaining: long,
    price: long,
}

global const MAX_BREACHES: int = 256;

struct RiskEngine {
    engine: *Engine,
    defaults: AccountLimits,
    accounts: *RiskAccount,
    account_cap: int,
    exposures: *RiskExposure,
    exposure_count: int,
    exposure_cap: int,
    exposure_index: LongMap,
    tracked: *TrackedOrder,
    tracked_count: int,
    tracked_cap: int,
    tracked_index: LongMap,
    restricted: LongMap,
    breaches: *RiskBreach,
    breach_start: int,
    breach_count: int,
    breach_total: long,
    last_trade_id: long,
    now_ms: long,
    rule_counts: long[11],

    frame init(this: *RiskEngine, engine: *Engine, defaults: AccountLimits) {
        this.engine = engine;
        this.defaults = defaults;
        this.account_cap = 0;
        this.accounts = nullptr;
        this.exposure_cap = 64;
        this.exposures = cast<*RiskExposure>(malloc(cast<long>(this.exposure_cap) * sizeof(RiskExposure)));
        this.exposure_count = 0;
        this.exposure_index = LongMap.new(64);
        this.tracked_cap = 256;
        this.tracked = cast<*TrackedOrder>(malloc(cast<long>(this.tracked_cap) * sizeof(TrackedOrder)));
        this.tracked_count = 0;
        this.tracked_index = LongMap.new(256);
        this.restricted = LongMap.new(16);
        this.breaches = cast<*RiskBreach>(malloc(cast<long>(MAX_BREACHES) * sizeof(RiskBreach)));
        this.breach_start = 0;
        this.breach_count = 0;
        this.breach_total = 0;
        local latest: *Trade = engine.tape.latest();
        this.last_trade_id = latest == nullptr ? 0 : latest.id;
        this.now_ms = 0;
        loop (local i: int = 0; i < 11; i = i + 1) {
            this.rule_counts[i] = 0;
        }
    }

    frame destroy(this: *RiskEngine) {
        if (this.accounts != nullptr) {
            free(cast<*void>(this.accounts));
            this.accounts = nullptr;
        }
        free(cast<*void>(this.exposures));
        free(cast<*void>(this.tracked));
        free(cast<*void>(this.breaches));
        this.exposure_index.destroy();
        this.tracked_index.destroy();
        this.restricted.destroy();
    }

    frame standardLimits() ret AccountLimits {
        return AccountLimits { max_order_qty: 100000, max_order_notional: 5000000.0, max_position: 500000, max_gross_notional: 50000000.0, max_open_orders: 1000, rate_per_sec: 500.0, burst: 1000.0, collar_bps: 1000, max_loss: 1000000.0 };
    }

    frame ruleName(rule: RiskRule) ret string {
        if (rule == RiskRule.Pass) {
            return "pass";
        }
        if (rule == RiskRule.KillSwitch) {
            return "kill_switch";
        }
        if (rule == RiskRule.Restricted) {
            return "restricted_symbol";
        }
        if (rule == RiskRule.OrderQuantity) {
            return "order_quantity";
        }
        if (rule == RiskRule.OrderNotional) {
            return "order_notional";
        }
        if (rule == RiskRule.PriceCollar) {
            return "price_collar";
        }
        if (rule == RiskRule.OpenOrders) {
            return "open_orders";
        }
        if (rule == RiskRule.OrderRate) {
            return "order_rate";
        }
        if (rule == RiskRule.Position) {
            return "position";
        }
        if (rule == RiskRule.GrossNotional) {
            return "gross_notional";
        }
        return "loss_limit";
    }

    frame ruleIndex(rule: RiskRule) ret int {
        if (rule == RiskRule.Pass) {
            return 0;
        }
        if (rule == RiskRule.KillSwitch) {
            return 1;
        }
        if (rule == RiskRule.Restricted) {
            return 2;
        }
        if (rule == RiskRule.OrderQuantity) {
            return 3;
        }
        if (rule == RiskRule.OrderNotional) {
            return 4;
        }
        if (rule == RiskRule.PriceCollar) {
            return 5;
        }
        if (rule == RiskRule.OpenOrders) {
            return 6;
        }
        if (rule == RiskRule.OrderRate) {
            return 7;
        }
        if (rule == RiskRule.Position) {
            return 8;
        }
        if (rule == RiskRule.GrossNotional) {
            return 9;
        }
        return 10;
    }

    frame ruleAt(index: int) ret RiskRule {
        local rules: RiskRule[11] = [RiskRule.Pass, RiskRule.KillSwitch, RiskRule.Restricted, RiskRule.OrderQuantity, RiskRule.OrderNotional, RiskRule.PriceCollar, RiskRule.OpenOrders, RiskRule.OrderRate, RiskRule.Position, RiskRule.GrossNotional, RiskRule.LossLimit];
        return rules[index];
    }

    # Account state, created on first use with the default limits.
    frame account(this: *RiskEngine, id: int) ret *RiskAccount {
        if (id >= this.account_cap) {
            local next_cap: int = this.account_cap == 0 ? 16 : this.account_cap;
            loop (next_cap <= id) {
                next_cap = next_cap * 2;
            }
            local next: *RiskAccount = cast<*RiskAccount>(malloc(cast<long>(next_cap) * sizeof(RiskAccount)));
            loop (local i: int = 0; i < next_cap; i = i + 1) {
                if (i < this.account_cap) {
                    next[i] = this.accounts[i];
                } else {
                    next[i] = RiskAccount { limits: this.defaults, killed: false, tokens: this.defaults.burst, last_refill_ms: this.now_ms, open_orders: 0, open_notional: 0.0, checks: 0, rejects: 0 };
                }
            }
            if (this.accounts != nullptr) {
                free(cast<*void>(this.accounts));
            }
            this.accounts = next;
            this.account_cap = next_cap;
        }
        return this.accounts + id;
    }

    frame setLimits(this: *RiskEngine, account: int, limits: AccountLimits) {
        local a: *RiskAccount = this.account(account);
        a.limits = limits;
        if (a.tokens > limits.burst) {
            a.tokens = limits.burst;
        }
    }

    frame restrict(this: *RiskEngine, symbol: int, on: bool) {
        if (on) {
            this.restricted.put(cast<long>(symbol), 1);
        } else {
            this.restricted.remove(cast<long>(symbol));
        }
    }

    frame exposure(this: *RiskEngine, account: int, symbol: int) ret *RiskExposure {
        local key: long = (cast<long>(account) << 20) | cast<long>(symbol);
        local found: long = this.exposure_index.getOr(key, -1);
        if (found >= 0) {
            return this.exposures + cast<int>(found);
        }
        if (this.exposure_count == this.exposure_cap) {
            local next: *RiskExposure = cast<*RiskExposure>(malloc(cast<long>(this.exposure_cap * 2) * sizeof(RiskExposure)));
            loop (local i: int = 0; i < this.exposure_count; i = i + 1) {
                next[i] = this.exposures[i];
            }
            free(cast<*void>(this.exposures));
            this.exposures = next;
            this.exposure_cap = this.exposure_cap * 2;
        }
        this.exposures[this.exposure_count] = RiskExposure { account: account, symbol: symbol, position: 0, open_buy: 0, open_sell: 0, cash: 0.0, traded: 0, last_price: 0 };
        this.exposure_index.put(key, cast<long>(this.exposure_count));
        this.exposure_count = this.exposure_count + 1;
        return this.exposures + (this.exposure_count - 1);
    }

    # Price used for notional and collar checks: limit price, else last
    # trade, else reference price.
    frame markPrice(this: *RiskEngine, symbol: int) ret long {
        local b: *OrderBook = this.engine.book(symbol);
        if (b == nullptr) {
            return 0;
        }
        if (b.last_price > 0) {
            return b.last_price;
        }
        return b.reference_price;
    }

    frame refill(this: *RiskEngine, a: *RiskAccount) {
        local elapsed: long = this.now_ms - a.last_refill_ms;
        if (elapsed > 0) {
            a.tokens = a.tokens + ((cast<float>(elapsed) / 1000.0) * a.limits.rate_per_sec);
            if (a.tokens > a.limits.burst) {
                a.tokens = a.limits.burst;
            }
            a.last_refill_ms = this.now_ms;
        }
    }

    frame decision(rule: RiskRule, message: string, value: float, limit: float) ret RiskDecision {
        return RiskDecision { rule: rule, message: message, value: value, limit: limit };
    }

    # Mark-to-market P&L of an account (realized cash plus positions at the
    # mark price).
    frame pnl(this: *RiskEngine, account: int) ret float {
        local total: float = 0.0;
        loop (local i: int = 0; i < this.exposure_count; i = i + 1) {
            local x: *RiskExposure = this.exposures + i;
            if (x.account == account) {
                total = total + x.cash + (cast<float>(x.position) * Ticks.toFloat(this.markPrice(x.symbol)));
            }
        }
        return total;
    }

    # Evaluates the rules without changing any state except the rate bucket.
    frame evaluate(this: *RiskEngine, req: *OrderRequest) ret RiskDecision {
        local a: *RiskAccount = this.account(req.account);
        local lim: *AccountLimits = &a.limits;
        if (a.killed) {
            return RiskEngine.decision(RiskRule.KillSwitch, "account is disabled by the kill switch", 1.0, 0.0);
        }
        if (this.restricted.has(cast<long>(req.symbol))) {
            return RiskEngine.decision(RiskRule.Restricted, "symbol is on the restricted list", 1.0, 0.0);
        }
        if (req.quantity > lim.max_order_qty) {
            return RiskEngine.decision(RiskRule.OrderQuantity, "order quantity above limit", cast<float>(req.quantity), cast<float>(lim.max_order_qty));
        }
        local mark: long = this.markPrice(req.symbol);
        local priced: bool = (req.kind == OrderType.Limit) || (req.kind == OrderType.StopLimit);
        local px: long = priced ? req.price : mark;
        local notional: float = cast<float>(req.quantity) * Ticks.toFloat(px);
        if (notional > lim.max_order_notional) {
            return RiskEngine.decision(RiskRule.OrderNotional, "order notional above limit", notional, lim.max_order_notional);
        }
        if (priced && (lim.collar_bps > 0) && (mark > 0)) {
            local away: long = req.price > mark ? req.price - mark : mark - req.price;
            local bps: long = (away * 10000) / mark;
            if (bps > lim.collar_bps) {
                return RiskEngine.decision(RiskRule.PriceCollar, "price outside the collar", cast<float>(bps), cast<float>(lim.collar_bps));
            }
        }
        if (a.open_orders >= lim.max_open_orders) {
            return RiskEngine.decision(RiskRule.OpenOrders, "too many open orders", cast<float>(a.open_orders + 1), cast<float>(lim.max_open_orders));
        }
        this.refill(a);
        if (a.tokens < 1.0) {
            return RiskEngine.decision(RiskRule.OrderRate, "order rate above limit", a.limits.rate_per_sec, a.limits.rate_per_sec);
        }
        local x: *RiskExposure = this.exposure(req.account, req.symbol);
        local worst: long = req.side == Side.Buy ? x.position + x.open_buy + req.quantity : -(x.position - x.open_sell - req.quantity);
        if (worst > lim.max_position) {
            return RiskEngine.decision(RiskRule.Position, "worst-case position above limit", cast<float>(worst), cast<float>(lim.max_position));
        }
        if ((a.open_notional + notional) > lim.max_gross_notional) {
            return RiskEngine.decision(RiskRule.GrossNotional, "gross open notional above limit", a.open_notional + notional, lim.max_gross_notional);
        }
        local p: float = this.pnl(req.account);
        if (p < -lim.max_loss) {
            return RiskEngine.decision(RiskRule.LossLimit, "loss limit reached", -p, lim.max_loss);
        }
        return RiskEngine.decision(RiskRule.Pass, nullptr, 0.0, 0.0);
    }

    frame recordBreach(this: *RiskEngine, req: *OrderRequest, d: *RiskDecision) {
        local slot: int = (this.breach_start + this.breach_count) % MAX_BREACHES;
        if (this.breach_count == MAX_BREACHES) {
            slot = this.breach_start;
            this.breach_start = (this.breach_start + 1) % MAX_BREACHES;
        } else {
            this.breach_count = this.breach_count + 1;
        }
        this.breaches[slot] = RiskBreach { account: req.account, symbol: req.symbol, rule: d.rule, value: d.value, limit: d.limit, time_ms: this.now_ms };
        this.breach_total = this.breach_total + 1;
    }

    # i = 0 is the oldest retained breach.
    frame breachAt(this: *RiskEngine, i: int) ret *RiskBreach {
        return this.breaches + ((this.breach_start + i) % MAX_BREACHES);
    }

    # Full pre-trade check: evaluates, consumes a rate token on success and
    # records breaches.
    frame check(this: *RiskEngine, req: *OrderRequest, now_ms: long) ret RiskDecision {
        if (now_ms > this.now_ms) {
            this.now_ms = now_ms;
        }
        local a: *RiskAccount = this.account(req.account);
        a.checks = a.checks + 1;
        local d: RiskDecision = this.evaluate(req);
        this.rule_counts[RiskEngine.ruleIndex(d.rule)] = this.rule_counts[RiskEngine.ruleIndex(d.rule)] + 1;
        if (d.rule != RiskRule.Pass) {
            a.rejects = a.rejects + 1;
            this.recordBreach(req, &d);
            return d;
        }
        a.tokens = a.tokens - 1.0;
        return d;
    }

    frame track(this: *RiskEngine, order_id: long, req: *OrderRequest, remaining: long) {
        if (remaining <= 0) {
            return;
        }
        if (this.tracked_count == this.tracked_cap) {
            this.compact();
        }
        if (this.tracked_count == this.tracked_cap) {
            local next: *TrackedOrder = cast<*TrackedOrder>(malloc(cast<long>(this.tracked_cap * 2) * sizeof(TrackedOrder)));
            loop (local i: int = 0; i < this.tracked_count; i = i + 1) {
                next[i] = this.tracked[i];
            }
            free(cast<*void>(this.tracked));
            this.tracked = next;
            this.tracked_cap = this.tracked_cap * 2;
        }
        local px: long = req.price > 0 ? req.price : this.markPrice(req.symbol);
        this.tracked[this.tracked_count] = TrackedOrder { order_id: order_id, account: req.account, symbol: req.symbol, buy: req.side == Side.Buy, remaining: remaining, price: px };
        this.tracked_index.put(order_id, cast<long>(this.tracked_count));
        this.tracked_count = this.tracked_count + 1;
        local x: *RiskExposure = this.exposure(req.account, req.symbol);
        if (req.side == Side.Buy) {
            x.open_buy = x.open_buy + remaining;
        } else {
            x.open_sell = x.open_sell + remaining;
        }
        local a: *RiskAccount = this.account(req.account);
        a.open_orders = a.open_orders + 1;
        a.open_notional = a.open_notional + (cast<float>(remaining) * Ticks.toFloat(px));
    }

    # Drops fully released entries and rebuilds the index.
    frame compact(this: *RiskEngine) {
        local k: int = 0;
        this.tracked_index.clear();
        loop (local i: int = 0; i < this.tracked_count; i = i + 1) {
            if (this.tracked[i].remaining > 0) {
                this.tracked[k] = this.tracked[i];
                this.tracked_index.put(this.tracked[k].order_id, cast<long>(k));
                k = k + 1;
            }
        }
        this.tracked_count = k;
    }

    # Removes `qty` of open exposure from a tracked order.
    frame release(this: *RiskEngine, order_id: long, qty: long) {
        local found: long = this.tracked_index.getOr(order_id, -1);
        if (found < 0) {
            return;
        }
        local t: *TrackedOrder = this.tracked + cast<int>(found);
        local take: long = qty > t.remaining ? t.remaining : qty;
        if (take <= 0) {
            return;
        }
        t.remaining = t.remaining - take;
        local x: *RiskExposure = this.exposure(t.account, t.symbol);
        if (t.buy) {
            x.open_buy = x.open_buy - take;
        } else {
            x.open_sell = x.open_sell - take;
        }
        local a: *RiskAccount = this.account(t.account);
        a.open_notional = a.open_notional - (cast<float>(take) * Ticks.toFloat(t.price));
        if ((a.open_notional < 0.000001) && (a.open_notional > -0.000001)) {
            a.open_notional = 0.0;
        }
        if (t.remaining == 0) {
            a.open_orders = a.open_orders - 1;
            this.tracked_index.remove(order_id);
        }
    }

    frame applyFill(this: *RiskEngine, account: int, symbol: int, buy: bool, qty: long, price: long) {
        local x: *RiskExposure = this.exposure(account, symbol);
        local value: float = cast<float>(qty) * Ticks.toFloat(price);
        if (buy) {
            x.position = x.position + qty;
            x.cash = x.cash - value;
        } else {
            x.position = x.position - qty;
            x.cash = x.cash + value;
        }
        x.traded = x.traded + qty;
        x.last_price = price;
    }

    # Consumes new trades: moves fill quantity from open exposure into
    # positions for both counterparties.
    frame syncTrades(this: *RiskEngine) {
        local n: int = this.engine.tape.count;
        local first: int = n;
        loop ((first > 0) && (this.engine.tape.at(first - 1).id > this.last_trade_id)) {
            first = first - 1;
        }
        loop (local i: int = first; i < n; i = i + 1) {
            local t: *Trade = this.engine.tape.at(i);
            this.applyFill(t.buy_account, t.symbol, true, t.quantity, t.price);
            this.applyFill(t.sell_account, t.symbol, false, t.quantity, t.price);
            this.release(t.buy_order, t.quantity);
            this.release(t.sell_order, t.quantity);
            this.last_trade_id = t.id;
        }
    }

    # Releases exposure for orders the engine no longer holds (cancelled,
    # expired, self-trade prevented).
    frame reconcile(this: *RiskEngine) {
        loop (local i: int = 0; i < this.tracked_count; i = i + 1) {
            local t: *TrackedOrder = this.tracked + i;
            if (t.remaining <= 0) {
                continue;
            }
            local o: *Order = this.engine.findOrder(t.order_id);
            if ((o == nullptr) || (o.id != t.order_id) || !o.isOpen()) {
                this.release(t.order_id, t.remaining);
            } else if (o.remaining < t.remaining) {
                this.release(t.order_id, t.remaining - o.remaining);
            }
        }
    }

    # Checks, submits and books an order in one step.
    frame submit(this: *RiskEngine, req: *OrderRequest, now_ms: long, decision: *RiskDecision) ret ExecReport {
        *decision = this.check(req, now_ms);
        if (decision.rule != RiskRule.Pass) {
            local r: ExecReport = Engine.emptyReport();
            return r;
        }
        local r: ExecReport = this.engine.submit(req);
        if (r.order_id != 0) {
            this.track(r.order_id, req, req.quantity);
        }
        this.syncTrades();
        this.reconcile();
        return r;
    }

    frame cancel(this: *RiskEngine, order_id: long) ret bool {
        local ok: bool = this.engine.cancel(order_id);
        this.reconcile();
        return ok;
    }

    # Kill switch: disables the account and cancels all of its open orders.
    frame kill(this: *RiskEngine, account: int) ret int {
        local a: *RiskAccount = this.account(account);
        a.killed = true;
        local cancelled: int = 0;
        loop (local i: int = 0; i < this.tracked_count; i = i + 1) {
            local t: *TrackedOrder = this.tracked + i;
            if ((t.account == account) && (t.remaining > 0)) {
                if (this.engine.cancel(t.order_id)) {
                    cancelled = cancelled + 1;
                }
            }
        }
        this.reconcile();
        return cancelled;
    }

    frame revive(this: *RiskEngine, account: int) {
        this.account(account).killed = false;
    }

    frame isKilled(this: *RiskEngine, account: int) ret bool {
        return this.account(account).killed;
    }

    frame openOrders(this: *RiskEngine, account: int) ret int {
        return this.account(account).open_orders;
    }

    frame openNotional(this: *RiskEngine, account: int) ret float {
        return this.account(account).open_notional;
    }

    frame position(this: *RiskEngine, account: int, symbol: int) ret long {
        return this.exposure(account, symbol).position;
    }

    frame grossPosition(this: *RiskEngine, account: int) ret float {
        local total: float = 0.0;
        loop (local i: int = 0; i < this.exposure_count; i = i + 1) {
            local x: *RiskExposure = this.exposures + i;
            if (x.account == account) {
                local p: long = x.position < 0 ? -x.position : x.position;
                total = total + (cast<float>(p) * Ticks.toFloat(this.markPrice(x.symbol)));
            }
        }
        return total;
    }

    frame ruleCount(this: *RiskEngine, rule: RiskRule) ret long {
        return this.rule_counts[RiskEngine.ruleIndex(rule)];
    }

    frame knownAccount(this: *RiskEngine, account: int) ret bool {
        return (account >= 0) && (account < this.account_cap);
    }

    frame checksFor(this: *RiskEngine, account: int) ret long {
        return this.account(account).checks;
    }

    frame rejectsFor(this: *RiskEngine, account: int) ret long {
        return this.account(account).rejects;
    }

    frame limitsFor(this: *RiskEngine, account: int) ret AccountLimits {
        return this.account(account).limits;
    }

    frame tokensFor(this: *RiskEngine, account: int) ret float {
        local a: *RiskAccount = this.account(account);
        this.refill(a);
        return a.tokens;
    }

    frame nameOf(this: *RiskEngine, account: int) ret string {
        local name: string = this.engine.accounts.name(account);
        return name == nullptr ? "?" : name;
    }

    frame describe(this: *RiskEngine, d: *RiskDecision) ret string {
        if (d.rule == RiskRule.Pass) {
            return "accepted";
        }
        return d.message;
    }

    frame exposureCount(this: *RiskEngine) ret int {
        return this.exposure_count;
    }

    frame exposureAt(this: *RiskEngine, i: int) ret *RiskExposure {
        return this.exposures + i;
    }

    frame isRestricted(this: *RiskEngine, symbol: int) ret bool {
        return this.restricted.has(cast<long>(symbol));
    }

    frame symbolName(this: *RiskEngine, symbol: int) ret string {
        return this.engine.symbolName(symbol);
    }
}
