# Multi-symbol matching engine.
#
# submit() validates a request, matches it against the opposite side in
# price-time priority, then rests, cancels or parks the remainder depending
# on order type and time in force. Stop orders wait in a trigger list and are
# released when a trade prints through their stop price. Self-trade
# prevention cancels the resting order (cancel-oldest).

import malloc, free from "std/c.bpl";
import [Order], [Trade], [Side], [OrderType], [TimeInForce], [OrderStatus], [RejectReason], [Ticks] from "./order.bpl";
import [OrderPool], [OrderBook], [BookSide], [PriceLevel] from "./book.bpl";
import [TradeTape] from "./tape.bpl";
import [LongMap], [StrIndex] from "../core/hashmap.bpl";
import [IVec] from "../core/vec.bpl";

export [Engine];
export [OrderRequest];
export [ExecReport];
export [EngineStats];

struct OrderRequest {
    symbol: int,
    account: int,
    side: Side,
    kind: OrderType,
    tif: TimeInForce,
    price: long,
    stop_price: long,
    quantity: long,
    timestamp: long,

    frame limit(symbol: int, account: int, side: Side, price: long, quantity: long) ret OrderRequest {
        return OrderRequest { symbol: symbol, account: account, side: side, kind: OrderType.Limit, tif: TimeInForce.GoodTillCancel, price: price, stop_price: 0, quantity: quantity, timestamp: 0 };
    }

    frame market(symbol: int, account: int, side: Side, quantity: long) ret OrderRequest {
        return OrderRequest { symbol: symbol, account: account, side: side, kind: OrderType.Market, tif: TimeInForce.ImmediateOrCancel, price: 0, stop_price: 0, quantity: quantity, timestamp: 0 };
    }
}

struct ExecReport {
    order_id: long,
    status: OrderStatus,
    reason: RejectReason,
    filled: long,
    remaining: long,
    notional: long,
    trades: int,
    first_trade: long,
    resting: bool,

    frame averagePrice(this: *ExecReport) ret float {
        if (this.filled == 0) {
            return 0.0;
        }
        return cast<float>(this.notional) / cast<float>(this.filled) / cast<float>(Ticks.perUnit());
    }
}

struct EngineStats {
    submitted: long,
    rejected: long,
    cancelled: long,
    replaced: long,
    trades: long,
    volume: long,
    stops_triggered: long,
    self_trades_prevented: long,
}

struct Engine {
    pool: OrderPool,
    books: *OrderBook,
    book_count: int,
    book_cap: int,
    symbols: StrIndex,
    accounts: StrIndex,
    ids: LongMap,
    tape: TradeTape,
    stops: IVec,
    next_order_id: long,
    next_trade_id: long,
    sequence: long,
    clock: long,
    stats: EngineStats,
    prevent_self_trade: bool,
    max_levels: int,

    frame new(tape_capacity: int) ret Engine {
        local e: Engine;
        e.pool = OrderPool.new(1024);
        e.book_cap = 16;
        e.books = cast<*OrderBook>(malloc(cast<long>(e.book_cap) * sizeof(OrderBook)));
        e.book_count = 0;
        e.symbols = StrIndex.new(16);
        e.accounts = StrIndex.new(64);
        e.ids = LongMap.new(1024);
        e.tape = TradeTape.new(tape_capacity);
        e.stops = IVec.new(64);
        e.next_order_id = 1;
        e.next_trade_id = 1;
        e.sequence = 0;
        e.clock = 0;
        e.stats = EngineStats { submitted: 0, rejected: 0, cancelled: 0, replaced: 0, trades: 0, volume: 0, stops_triggered: 0, self_trades_prevented: 0 };
        e.prevent_self_trade = true;
        e.max_levels = 100000;
        return e;
    }

    frame destroy(this: *Engine) {
        loop (local i: int = 0; i < this.book_count; i = i + 1) {
            this.books[i].destroy();
        }
        free(cast<*void>(this.books));
        this.books = nullptr;
        this.pool.destroy();
        this.symbols.destroy();
        this.accounts.destroy();
        this.ids.destroy();
        this.tape.destroy();
        this.stops.destroy();
    }

    frame addSymbol(this: *Engine, name: string, reference_price: long) ret int {
        local existing: int = this.symbols.find(name);
        if (existing >= 0) {
            return existing;
        }
        local id: int = this.symbols.intern(name);
        if (this.book_count == this.book_cap) {
            local next_cap: int = this.book_cap * 2;
            local next: *OrderBook = cast<*OrderBook>(malloc(cast<long>(next_cap) * sizeof(OrderBook)));
            loop (local i: int = 0; i < this.book_count; i = i + 1) {
                next[i] = this.books[i];
            }
            free(cast<*void>(this.books));
            this.books = next;
            this.book_cap = next_cap;
        }
        this.books[id] = OrderBook.new(id, reference_price);
        this.book_count = this.book_count + 1;
        return id;
    }

    frame symbolId(this: *Engine, name: string) ret int {
        return this.symbols.find(name);
    }

    frame symbolName(this: *Engine, id: int) ret string {
        return this.symbols.name(id);
    }

    frame accountId(this: *Engine, name: string) ret int {
        return this.accounts.intern(name);
    }

    frame book(this: *Engine, symbol: int) ret *OrderBook {
        if ((symbol < 0) || (symbol >= this.book_count)) {
            return nullptr;
        }
        return this.books + symbol;
    }

    frame findOrder(this: *Engine, id: long) ret *Order {
        local idx: long = this.ids.getOr(id, -1);
        if (idx < 0) {
            return nullptr;
        }
        return this.pool.at(cast<int>(idx));
    }

    frame tick(this: *Engine) ret long {
        this.clock = this.clock + 1;
        return this.clock;
    }

    frame reject(this: *Engine, report: *ExecReport, reason: RejectReason) {
        report.status = OrderStatus.Rejected;
        report.reason = reason;
        this.stats.rejected = this.stats.rejected + 1;
    }

    frame emptyReport() ret ExecReport {
        return ExecReport { order_id: 0, status: OrderStatus.New, reason: RejectReason.None, filled: 0, remaining: 0, notional: 0, trades: 0, first_trade: 0, resting: false };
    }

    frame validateRequest(this: *Engine, req: *OrderRequest) ret RejectReason {
        if ((req.symbol < 0) || (req.symbol >= this.book_count)) {
            return RejectReason.UnknownSymbol;
        }
        if ((req.quantity <= 0) || (req.quantity > 1000000000)) {
            return RejectReason.InvalidQuantity;
        }
        local priced: bool = (req.kind == OrderType.Limit) || (req.kind == OrderType.StopLimit);
        if (priced && (req.price <= 0)) {
            return RejectReason.InvalidPrice;
        }
        local stopped: bool = (req.kind == OrderType.Stop) || (req.kind == OrderType.StopLimit);
        if (stopped && (req.stop_price <= 0)) {
            return RejectReason.InvalidPrice;
        }
        local b: *OrderBook = this.books + req.symbol;
        if (priced && (b.band_bps > 0) && (b.reference_price > 0)) {
            local lo: long = b.reference_price - ((b.reference_price * b.band_bps) / 10000);
            local hi: long = b.reference_price + ((b.reference_price * b.band_bps) / 10000);
            if ((req.price < lo) || (req.price > hi)) {
                return RejectReason.PriceBand;
            }
        }
        return RejectReason.None;
    }

    frame submit(this: *Engine, req: *OrderRequest) ret ExecReport {
        local report: ExecReport = Engine.emptyReport();
        this.stats.submitted = this.stats.submitted + 1;
        local reason: RejectReason = this.validateRequest(req);
        if (reason != RejectReason.None) {
            this.reject(&report, reason);
            return report;
        }
        local idx: int = this.pool.alloc();
        local o: *Order = this.pool.at(idx);
        o.id = this.next_order_id;
        this.next_order_id = this.next_order_id + 1;
        o.symbol = req.symbol;
        o.account = req.account;
        o.side = req.side;
        o.kind = req.kind;
        o.tif = req.tif;
        o.status = OrderStatus.New;
        o.price = req.price;
        o.stop_price = req.stop_price;
        o.quantity = req.quantity;
        o.remaining = req.quantity;
        o.filled_notional = 0;
        this.sequence = this.sequence + 1;
        o.sequence = this.sequence;
        o.timestamp = req.timestamp != 0 ? req.timestamp : this.tick();
        o.prev = -1;
        o.next = -1;
        o.level = -1;
        report.order_id = o.id;
        this.ids.put(o.id, cast<long>(idx));
        if ((o.kind == OrderType.Stop) || (o.kind == OrderType.StopLimit)) {
            local b: *OrderBook = this.books + o.symbol;
            if (!this.stopTriggered(o, b.last_price)) {
                o.status = OrderStatus.Pending;
                this.stops.push(idx);
                report.status = OrderStatus.Pending;
                report.remaining = o.remaining;
                return report;
            }
            this.convertStop(o);
        }
        local symbol: int = o.symbol;
        this.execute(idx, &report);
        this.releaseStops(symbol);
        return report;
    }

    frame stopTriggered(this: *Engine, o: *Order, last: long) ret bool {
        if (last <= 0) {
            return false;
        }
        if (o.side == Side.Buy) {
            return last >= o.stop_price;
        }
        return last <= o.stop_price;
    }

    frame convertStop(this: *Engine, o: *Order) {
        if (o.kind == OrderType.Stop) {
            o.kind = OrderType.Market;
            o.tif = TimeInForce.ImmediateOrCancel;
        } else {
            o.kind = OrderType.Limit;
        }
        o.status = OrderStatus.New;
    }

    # Matches and then rests/cancels the order at pool index idx.
    frame execute(this: *Engine, idx: int, report: *ExecReport) {
        local o: *Order = this.pool.at(idx);
        local b: *OrderBook = this.books + o.symbol;
        local is_market: bool = o.kind == OrderType.Market;
        local opposite: *BookSide = b.oppositeOf(o.side);
        if (o.tif == TimeInForce.FillOrKill) {
            local available: long = opposite.quantityThrough(o.price, is_market);
            if (available < o.remaining) {
                o.status = OrderStatus.Rejected;
                report.status = OrderStatus.Rejected;
                report.reason = RejectReason.FillOrKillUnfilled;
                report.remaining = o.remaining;
                this.stats.rejected = this.stats.rejected + 1;
                this.retire(idx);
                return;
            }
        }
        if (is_market && (opposite.count == 0)) {
            o.status = OrderStatus.Cancelled;
            report.status = OrderStatus.Cancelled;
            report.reason = RejectReason.NoLiquidity;
            report.remaining = o.remaining;
            this.stats.cancelled = this.stats.cancelled + 1;
            this.retire(idx);
            return;
        }
        loop ((o.remaining > 0) && (opposite.count > 0)) {
            local level: *PriceLevel = opposite.levels;
            if (!is_market) {
                local crosses: bool = o.side == Side.Buy ? level.price <= o.price : level.price >= o.price;
                if (!crosses) {
                    break;
                }
            }
            local maker_idx: int = level.head;
            local maker: *Order = this.pool.at(maker_idx);
            if (this.prevent_self_trade && (maker.account == o.account)) {
                # Cancel the resting order and keep matching.
                b.unlink(&this.pool, maker_idx);
                maker.status = OrderStatus.Cancelled;
                this.stats.self_trades_prevented = this.stats.self_trades_prevented + 1;
                this.retire(maker_idx);
                continue;
            }
            local qty: long = o.remaining < maker.remaining ? o.remaining : maker.remaining;
            local price: long = maker.price;
            this.fill(b, o, maker, maker_idx, price, qty, report);
        }
        report.filled = o.filled();
        report.remaining = o.remaining;
        report.notional = o.filled_notional;
        if (o.remaining == 0) {
            o.status = OrderStatus.Filled;
            report.status = OrderStatus.Filled;
            this.retire(idx);
            return;
        }
        local can_rest: bool = !is_market && ((o.tif == TimeInForce.GoodTillCancel) || (o.tif == TimeInForce.Day));
        if (can_rest) {
            if ((b.sideFor(o.side).count >= this.max_levels) && (b.sideFor(o.side).search(o.price) < 0)) {
                o.status = OrderStatus.Cancelled;
                report.status = OrderStatus.Cancelled;
                report.reason = RejectReason.BookFull;
                this.retire(idx);
                return;
            }
            o.status = o.filled() > 0 ? OrderStatus.PartiallyFilled : OrderStatus.New;
            report.status = o.status;
            report.resting = true;
            b.rest(&this.pool, idx);
            return;
        }
        o.status = OrderStatus.Cancelled;
        report.status = o.filled() > 0 ? OrderStatus.PartiallyFilled : OrderStatus.Cancelled;
        if ((o.filled() == 0) && is_market) {
            report.reason = RejectReason.NoLiquidity;
        }
        this.stats.cancelled = this.stats.cancelled + 1;
        this.retire(idx);
    }

    frame fill(this: *Engine, b: *OrderBook, taker: *Order, maker: *Order, maker_idx: int, price: long, qty: long, report: *ExecReport) {
        local t: Trade;
        t.id = this.next_trade_id;
        this.next_trade_id = this.next_trade_id + 1;
        t.symbol = b.symbol;
        t.price = price;
        t.quantity = qty;
        t.aggressor = taker.side;
        if (taker.side == Side.Buy) {
            t.buy_order = taker.id;
            t.sell_order = maker.id;
            t.buy_account = taker.account;
            t.sell_account = maker.account;
        } else {
            t.buy_order = maker.id;
            t.sell_order = taker.id;
            t.buy_account = maker.account;
            t.sell_account = taker.account;
        }
        this.sequence = this.sequence + 1;
        t.sequence = this.sequence;
        t.timestamp = this.tick();
        this.tape.push(t);
        if (report.trades == 0) {
            report.first_trade = t.id;
        }
        report.trades = report.trades + 1;
        taker.remaining = taker.remaining - qty;
        taker.filled_notional = taker.filled_notional + (price * qty);
        maker.filled_notional = maker.filled_notional + (price * qty);
        if (qty == maker.remaining) {
            b.unlink(&this.pool, maker_idx);
            maker.remaining = 0;
            maker.status = OrderStatus.Filled;
            this.retire(maker_idx);
        } else {
            b.reduce(&this.pool, maker_idx, qty);
            maker.status = OrderStatus.PartiallyFilled;
        }
        b.recordTrade(price, qty);
        this.stats.trades = this.stats.trades + 1;
        this.stats.volume = this.stats.volume + qty;
    }

    # Removes a finished order from the id index and frees its pool slot.
    frame retire(this: *Engine, idx: int) {
        local o: *Order = this.pool.at(idx);
        this.ids.remove(o.id);
        this.pool.release(idx);
    }

    # Releases stop orders triggered by the latest trade; repeats because a
    # released stop can itself trade through further stops.
    frame releaseStops(this: *Engine, symbol: int) {
        # New stops are checked on arrival, so a rescan is only needed when
        # the last price moved since the previous scan.
        local book: *OrderBook = this.books + symbol;
        if ((this.stops.len == 0) || (book.last_price == book.stop_scan_price)) {
            return;
        }
        local guard: int = 0;
        local changed: bool = true;
        loop (changed && (guard < 1000)) {
            changed = false;
            guard = guard + 1;
            local b: *OrderBook = this.books + symbol;
            local i: int = 0;
            loop (i < this.stops.len) {
                local idx: int = this.stops.data[i];
                local o: *Order = this.pool.at(idx);
                if ((o.symbol == symbol) && this.stopTriggered(o, b.last_price)) {
                    this.stops.data[i] = this.stops.data[this.stops.len - 1];
                    this.stops.len = this.stops.len - 1;
                    this.convertStop(o);
                    this.stats.stops_triggered = this.stats.stops_triggered + 1;
                    local r: ExecReport = Engine.emptyReport();
                    r.order_id = o.id;
                    this.execute(idx, &r);
                    changed = true;
                } else {
                    i = i + 1;
                }
            }
        }
        book.stop_scan_price = book.last_price;
    }

    frame cancel(this: *Engine, id: long) ret bool {
        local found: long = this.ids.getOr(id, -1);
        if (found < 0) {
            return false;
        }
        local idx: int = cast<int>(found);
        local o: *Order = this.pool.at(idx);
        if (o.status == OrderStatus.Pending) {
            loop (local i: int = 0; i < this.stops.len; i = i + 1) {
                if (this.stops.data[i] == idx) {
                    this.stops.data[i] = this.stops.data[this.stops.len - 1];
                    this.stops.len = this.stops.len - 1;
                    break;
                }
            }
        } else {
            local b: *OrderBook = this.books + o.symbol;
            b.unlink(&this.pool, idx);
        }
        o.status = OrderStatus.Cancelled;
        this.stats.cancelled = this.stats.cancelled + 1;
        this.retire(idx);
        return true;
    }

    # Cancel/replace. Reducing quantity at the same price keeps priority;
    # anything else re-enters the book as a new order with a new id.
    frame replace(this: *Engine, id: long, price: long, quantity: long) ret ExecReport {
        local report: ExecReport = Engine.emptyReport();
        local found: long = this.ids.getOr(id, -1);
        if (found < 0) {
            this.reject(&report, RejectReason.UnknownOrder);
            return report;
        }
        local idx: int = cast<int>(found);
        local o: *Order = this.pool.at(idx);
        if ((o.status == OrderStatus.Pending) || (o.kind != OrderType.Limit)) {
            this.reject(&report, RejectReason.UnknownOrder);
            return report;
        }
        if (quantity <= o.filled()) {
            this.reject(&report, RejectReason.InvalidQuantity);
            return report;
        }
        local new_remaining: long = quantity - o.filled();
        this.stats.replaced = this.stats.replaced + 1;
        if ((price == o.price) && (new_remaining <= o.remaining)) {
            local b: *OrderBook = this.books + o.symbol;
            b.reduce(&this.pool, idx, o.remaining - new_remaining);
            o.quantity = quantity;
            report.order_id = o.id;
            report.status = o.status;
            report.remaining = o.remaining;
            report.filled = o.filled();
            report.resting = true;
            return report;
        }
        local req: OrderRequest = OrderRequest { symbol: o.symbol, account: o.account, side: o.side, kind: OrderType.Limit, tif: o.tif, price: price, stop_price: 0, quantity: new_remaining, timestamp: 0 };
        this.cancel(id);
        this.stats.cancelled = this.stats.cancelled - 1;
        return this.submit(&req);
    }

    # Ends the trading day: cancels resting Day orders.
    frame endOfDay(this: *Engine) ret int {
        local cancelled: int = 0;
        local ids: IVec = IVec.new(64);
        loop (local s: int = 0; s < this.book_count; s = s + 1) {
            local b: *OrderBook = this.books + s;
            loop (local side: int = 0; side < 2; side = side + 1) {
                local bs: *BookSide = side == 0 ? &b.bids : &b.asks;
                loop (local l: int = 0; l < bs.count; l = l + 1) {
                    local cur: int = bs.levels[l].head;
                    loop (cur >= 0) {
                        local o: *Order = this.pool.at(cur);
                        if (o.tif == TimeInForce.Day) {
                            ids.push(cur);
                        }
                        cur = o.next;
                    }
                }
            }
        }
        loop (local i: int = 0; i < ids.len; i = i + 1) {
            if (this.cancel(this.pool.at(ids.data[i]).id)) {
                cancelled = cancelled + 1;
            }
        }
        ids.destroy();
        return cancelled;
    }

    frame openOrders(this: *Engine) ret int {
        return this.pool.live;
    }

    frame validate(this: *Engine) ret string {
        loop (local s: int = 0; s < this.book_count; s = s + 1) {
            local err: string = this.books[s].validate(&this.pool);
            if (err != nullptr) {
                return err;
            }
        }
        return nullptr;
    }
}
