# Price-time priority order book.
#
# Orders live in a shared OrderPool and are addressed by pool index. Each
# side keeps a sorted array of price levels, best price first; each level is
# an intrusive doubly linked FIFO of orders, so cancel is O(1) once the order
# is located and matching walks orders in arrival order.

import malloc, free, memmove from "std/c.bpl";
import [Order], [Side], [OrderStatus], [OrderType], [TimeInForce] from "./order.bpl";

export [OrderPool];
export [PriceLevel];
export [BookSide];
export [OrderBook];
export [DepthLevel];

struct OrderPool {
    orders: *Order,
    cap: int,
    count: int,
    free_head: int,
    live: int,

    frame new(capacity: int) ret OrderPool {
        local p: OrderPool;
        p.cap = capacity < 16 ? 16 : capacity;
        p.orders = cast<*Order>(malloc(cast<long>(p.cap) * sizeof(Order)));
        if (p.orders == nullptr) {
            throw "OrderPool allocation failed";
        }
        p.count = 0;
        p.free_head = -1;
        p.live = 0;
        return p;
    }

    frame destroy(this: *OrderPool) {
        if (this.orders != nullptr) {
            free(cast<*void>(this.orders));
            this.orders = nullptr;
        }
        this.cap = 0;
        this.count = 0;
    }

    frame grow(this: *OrderPool) {
        local next_cap: int = this.cap * 2;
        local next: *Order = cast<*Order>(malloc(cast<long>(next_cap) * sizeof(Order)));
        if (next == nullptr) {
            throw "OrderPool allocation failed";
        }
        loop (local i: int = 0; i < this.count; i = i + 1) {
            next[i] = this.orders[i];
        }
        free(cast<*void>(this.orders));
        this.orders = next;
        this.cap = next_cap;
    }

    # Allocates a slot; free slots are reused through the `next` link.
    frame alloc(this: *OrderPool) ret int {
        this.live = this.live + 1;
        if (this.free_head >= 0) {
            local idx: int = this.free_head;
            this.free_head = this.orders[idx].next;
            this.orders[idx].init();
            return idx;
        }
        if (this.count == this.cap) {
            this.grow();
        }
        local idx: int = this.count;
        this.count = this.count + 1;
        this.orders[idx].init();
        return idx;
    }

    frame release(this: *OrderPool, idx: int) {
        this.orders[idx].next = this.free_head;
        this.orders[idx].prev = -1;
        this.orders[idx].level = -1;
        this.free_head = idx;
        this.live = this.live - 1;
    }

    frame at(this: *OrderPool, idx: int) ret *Order {
        return this.orders + idx;
    }
}

struct PriceLevel {
    price: long,
    head: int,
    tail: int,
    total: long,
    count: int,
}

struct DepthLevel {
    price: long,
    quantity: long,
    orders: int,
}

struct BookSide {
    levels: *PriceLevel,
    count: int,
    cap: int,
    # Bids are sorted descending (best = highest), asks ascending.
    descending: bool,

    frame new(descending: bool) ret BookSide {
        local s: BookSide;
        s.cap = 64;
        s.levels = cast<*PriceLevel>(malloc(cast<long>(s.cap) * sizeof(PriceLevel)));
        s.count = 0;
        s.descending = descending;
        return s;
    }

    frame destroy(this: *BookSide) {
        if (this.levels != nullptr) {
            free(cast<*void>(this.levels));
            this.levels = nullptr;
        }
        this.count = 0;
    }

    # True when price a has strictly better priority than b on this side.
    frame better(this: *BookSide, a: long, b: long) ret bool {
        if (this.descending) {
            return a > b;
        }
        return a < b;
    }

    # Index of the level with this price, or the insertion point encoded as -(pos + 1).
    frame search(this: *BookSide, price: long) ret int {
        local lo: int = 0;
        local hi: int = this.count;
        loop (lo < hi) {
            local mid: int = (lo + hi) >> 1;
            local p: long = this.levels[mid].price;
            if (p == price) {
                return mid;
            }
            if (this.better(p, price)) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        return -(lo + 1);
    }

    frame insertAt(this: *BookSide, pos: int, price: long) ret int {
        if (this.count == this.cap) {
            local next_cap: int = this.cap * 2;
            local next: *PriceLevel = cast<*PriceLevel>(malloc(cast<long>(next_cap) * sizeof(PriceLevel)));
            loop (local i: int = 0; i < this.count; i = i + 1) {
                next[i] = this.levels[i];
            }
            free(cast<*void>(this.levels));
            this.levels = next;
            this.cap = next_cap;
        }
        local moved: int = this.count - pos;
        if (moved > 0) {
            memmove(cast<*void>(this.levels + pos + 1), cast<*void>(this.levels + pos), cast<long>(moved) * sizeof(PriceLevel));
        }
        this.levels[pos] = PriceLevel { price: price, head: -1, tail: -1, total: 0, count: 0 };
        this.count = this.count + 1;
        return pos;
    }

    frame removeAt(this: *BookSide, pos: int) {
        local moved: int = this.count - pos - 1;
        if (moved > 0) {
            memmove(cast<*void>(this.levels + pos), cast<*void>(this.levels + pos + 1), cast<long>(moved) * sizeof(PriceLevel));
        }
        this.count = this.count - 1;
    }

    frame levelFor(this: *BookSide, price: long) ret int {
        local idx: int = this.search(price);
        if (idx >= 0) {
            return idx;
        }
        return this.insertAt(-idx - 1, price);
    }

    frame best(this: *BookSide) ret *PriceLevel {
        if (this.count == 0) {
            return nullptr;
        }
        return this.levels;
    }

    frame totalQuantity(this: *BookSide) ret long {
        local s: long = 0;
        loop (local i: int = 0; i < this.count; i = i + 1) {
            s = s + this.levels[i].total;
        }
        return s;
    }

    # Quantity available at prices at least as good as `limit`.
    frame quantityThrough(this: *BookSide, limit: long, unlimited: bool) ret long {
        local s: long = 0;
        loop (local i: int = 0; i < this.count; i = i + 1) {
            local p: long = this.levels[i].price;
            if (!unlimited && this.better(limit, p)) {
                break;
            }
            s = s + this.levels[i].total;
        }
        return s;
    }
}

struct OrderBook {
    symbol: int,
    bids: BookSide,
    asks: BookSide,
    last_price: long,
    last_quantity: long,
    volume: long,
    notional: long,
    trade_count: long,
    open_price: long,
    high_price: long,
    low_price: long,
    reference_price: long,
    # Percentage band (in basis points) around the reference price; 0 = off.
    band_bps: long,
    # Last price at which pending stops were scanned (-1 = never).
    stop_scan_price: long,

    frame new(symbol: int, reference_price: long) ret OrderBook {
        local b: OrderBook;
        b.symbol = symbol;
        b.bids = BookSide.new(true);
        b.asks = BookSide.new(false);
        b.last_price = 0;
        b.last_quantity = 0;
        b.volume = 0;
        b.notional = 0;
        b.trade_count = 0;
        b.open_price = 0;
        b.high_price = 0;
        b.low_price = 0;
        b.reference_price = reference_price;
        b.band_bps = 0;
        b.stop_scan_price = -1;
        return b;
    }

    frame destroy(this: *OrderBook) {
        this.bids.destroy();
        this.asks.destroy();
    }

    frame sideFor(this: *OrderBook, side: Side) ret *BookSide {
        if (side == Side.Buy) {
            return &this.bids;
        }
        return &this.asks;
    }

    frame oppositeOf(this: *OrderBook, side: Side) ret *BookSide {
        if (side == Side.Buy) {
            return &this.asks;
        }
        return &this.bids;
    }

    frame bestBid(this: *OrderBook) ret long {
        if (this.bids.count == 0) {
            return 0;
        }
        return this.bids.levels[0].price;
    }

    frame bestAsk(this: *OrderBook) ret long {
        if (this.asks.count == 0) {
            return 0;
        }
        return this.asks.levels[0].price;
    }

    frame spread(this: *OrderBook) ret long {
        if ((this.bids.count == 0) || (this.asks.count == 0)) {
            return 0;
        }
        return this.bestAsk() - this.bestBid();
    }

    frame mid(this: *OrderBook) ret float {
        if ((this.bids.count == 0) || (this.asks.count == 0)) {
            return cast<float>(this.last_price);
        }
        return 0.5 * cast<float>(this.bestBid() + this.bestAsk());
    }

    # Size-weighted mid using the top level on each side.
    frame microprice(this: *OrderBook) ret float {
        if ((this.bids.count == 0) || (this.asks.count == 0)) {
            return this.mid();
        }
        local bq: float = cast<float>(this.bids.levels[0].total);
        local aq: float = cast<float>(this.asks.levels[0].total);
        local bp: float = cast<float>(this.bids.levels[0].price);
        local ap: float = cast<float>(this.asks.levels[0].price);
        return ((bp * aq) + (ap * bq)) / (aq + bq);
    }

    # Order-book imbalance over the top `depth` levels, in [-1, 1].
    frame imbalance(this: *OrderBook, depth: int) ret float {
        local b: long = 0;
        local a: long = 0;
        loop (local i: int = 0; (i < depth) && (i < this.bids.count); i = i + 1) {
            b = b + this.bids.levels[i].total;
        }
        loop (local i: int = 0; (i < depth) && (i < this.asks.count); i = i + 1) {
            a = a + this.asks.levels[i].total;
        }
        if ((a + b) == 0) {
            return 0.0;
        }
        return cast<float>(b - a) / cast<float>(b + a);
    }

    # Appends the order (already in the pool) to the tail of its price level.
    frame rest(this: *OrderBook, pool: *OrderPool, idx: int) {
        local o: *Order = pool.at(idx);
        local side: *BookSide = this.sideFor(o.side);
        local li: int = side.levelFor(o.price);
        local level: *PriceLevel = side.levels + li;
        o.prev = level.tail;
        o.next = -1;
        if (level.tail >= 0) {
            pool.at(level.tail).next = idx;
        } else {
            level.head = idx;
        }
        level.tail = idx;
        level.total = level.total + o.remaining;
        level.count = level.count + 1;
    }

    # Unlinks a resting order; removes its level when it becomes empty.
    frame unlink(this: *OrderBook, pool: *OrderPool, idx: int) ret bool {
        local o: *Order = pool.at(idx);
        local side: *BookSide = this.sideFor(o.side);
        local li: int = side.search(o.price);
        if (li < 0) {
            return false;
        }
        local level: *PriceLevel = side.levels + li;
        if (o.prev >= 0) {
            pool.at(o.prev).next = o.next;
        } else {
            level.head = o.next;
        }
        if (o.next >= 0) {
            pool.at(o.next).prev = o.prev;
        } else {
            level.tail = o.prev;
        }
        level.total = level.total - o.remaining;
        level.count = level.count - 1;
        o.prev = -1;
        o.next = -1;
        if (level.count == 0) {
            side.removeAt(li);
        }
        return true;
    }

    # Reduces a resting order's quantity in place, keeping its priority.
    frame reduce(this: *OrderBook, pool: *OrderPool, idx: int, by: long) {
        local o: *Order = pool.at(idx);
        local side: *BookSide = this.sideFor(o.side);
        local li: int = side.search(o.price);
        if (li >= 0) {
            side.levels[li].total = side.levels[li].total - by;
        }
        o.remaining = o.remaining - by;
    }

    frame recordTrade(this: *OrderBook, price: long, quantity: long) {
        if (this.trade_count == 0) {
            this.open_price = price;
            this.high_price = price;
            this.low_price = price;
        }
        if (price > this.high_price) {
            this.high_price = price;
        }
        if (price < this.low_price) {
            this.low_price = price;
        }
        this.last_price = price;
        this.last_quantity = quantity;
        this.volume = this.volume + quantity;
        this.notional = this.notional + (price * quantity);
        this.trade_count = this.trade_count + 1;
    }

    frame vwap(this: *OrderBook) ret float {
        if (this.volume == 0) {
            return 0.0;
        }
        return cast<float>(this.notional) / cast<float>(this.volume);
    }

    frame depth(this: *OrderBook, side: Side, out: *DepthLevel, max_levels: int) ret int {
        local s: *BookSide = this.sideFor(side);
        local n: int = s.count < max_levels ? s.count : max_levels;
        loop (local i: int = 0; i < n; i = i + 1) {
            out[i] = DepthLevel { price: s.levels[i].price, quantity: s.levels[i].total, orders: s.levels[i].count };
        }
        return n;
    }

    # Average fill price for a hypothetical market order of `quantity`; 0 if not enough depth.
    frame impactPrice(this: *OrderBook, side: Side, quantity: long) ret float {
        local s: *BookSide = this.oppositeOf(side);
        local left: long = quantity;
        local cost: float = 0.0;
        loop (local i: int = 0; (i < s.count) && (left > 0); i = i + 1) {
            local take: long = s.levels[i].total < left ? s.levels[i].total : left;
            cost = cost + (cast<float>(take) * cast<float>(s.levels[i].price));
            left = left - take;
        }
        if (left > 0) {
            return 0.0;
        }
        return cost / cast<float>(quantity);
    }

    # Structural self-check used by the self-test and the /debug endpoint.
    frame validate(this: *OrderBook, pool: *OrderPool) ret string {
        local sides: int = 0;
        loop (sides < 2) {
            local s: *BookSide = sides == 0 ? &this.bids : &this.asks;
            loop (local i: int = 0; i < s.count; i = i + 1) {
                if ((i > 0) && !s.better(s.levels[i - 1].price, s.levels[i].price)) {
                    return "levels out of order";
                }
                local total: long = 0;
                local count: int = 0;
                local cur: int = s.levels[i].head;
                local prev: int = -1;
                loop (cur >= 0) {
                    local o: *Order = pool.at(cur);
                    if (o.prev != prev) {
                        return "broken prev link";
                    }
                    if (o.price != s.levels[i].price) {
                        return "order at wrong level";
                    }
                    if (o.remaining <= 0) {
                        return "empty order resting";
                    }
                    total = total + o.remaining;
                    count = count + 1;
                    prev = cur;
                    cur = o.next;
                }
                if (prev != s.levels[i].tail) {
                    return "tail mismatch";
                }
                if ((total != s.levels[i].total) || (count != s.levels[i].count)) {
                    return "level totals mismatch";
                }
                if (count == 0) {
                    return "empty level";
                }
            }
            sides = sides + 1;
        }
        if ((this.bids.count > 0) && (this.asks.count > 0) && (this.bestBid() >= this.bestAsk())) {
            return "crossed book";
        }
        return nullptr;
    }
}
