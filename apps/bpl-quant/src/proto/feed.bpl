# Market-data publisher and feed handler.
#
# FeedPublisher wraps the matching engine: every order action becomes the
# order-by-order messages a venue would publish (executions against resting
# orders, adds for the resting remainder, deletes, partial cancels). Stop
# orders and self-trade prevention change the book without a client action,
# so the publisher disables self-trade prevention and accepts limit and
# market orders only.
#
# FeedBook is the subscriber side: it rebuilds every order and the
# aggregated depth from the messages alone. The self-test compares it level
# by level with the engine's own books after a replay with packet loss.

import malloc, free from "std/c.bpl";
import [LongMap] from "../core/hashmap.bpl";
import [Text] from "../core/text.bpl";
import [Engine], [OrderRequest], [ExecReport] from "../market/engine.bpl";
import [Order], [Trade], [Side], [OrderType], [TimeInForce], [OrderStatus] from "../market/order.bpl";
import [DepthLevel], [OrderBook] from "../market/book.bpl";
import [ItchMsg], [ItchCodec], [MoldWriter] from "./itch.bpl";

export [FeedPublisher];
export [FeedBook];
export [FeedLevel];
export [FeedStats];

struct FeedStats {
    adds: long,
    executions: long,
    cancels: long,
    deletes: long,
    replaces: long,
    trades: long,
    system: long,
    directory: long,
    unknown_refs: long,
}

struct FeedPublisher {
    engine: *Engine,
    writer: MoldWriter,
    last_trade_id: long,
    clock_ns: long,
    stats: FeedStats,

    frame init(this: *FeedPublisher, engine: *Engine, session: string, packet_bytes: int) {
        this.engine = engine;
        engine.prevent_self_trade = false;
        this.writer.init(session, packet_bytes);
        local latest: *Trade = engine.tape.latest();
        this.last_trade_id = latest == nullptr ? 0 : latest.id;
        this.clock_ns = 34200000000000;
        this.stats = FeedStats { adds: 0, executions: 0, cancels: 0, deletes: 0, replaces: 0, trades: 0, system: 0, directory: 0, unknown_refs: 0 };
    }

    frame destroy(this: *FeedPublisher) {
        this.writer.destroy();
    }

    frame stamp(this: *FeedPublisher) ret long {
        this.clock_ns = this.clock_ns + 1000;
        return this.clock_ns;
    }

    frame emit(this: *FeedPublisher, m: *ItchMsg) {
        this.writer.add(m);
    }

    # Start-of-day: system event and one directory entry per symbol.
    frame open(this: *FeedPublisher) {
        local s: ItchMsg = ItchCodec.blank('S', 0, this.stamp());
        s.code = 'O';
        this.emit(&s);
        this.stats.system = this.stats.system + 1;
        loop (local i: int = 0; i < this.engine.book_count; i = i + 1) {
            local d: ItchMsg = ItchCodec.blank('R', i + 1, this.stamp());
            local name: string = this.engine.symbolName(i);
            local k: int = 0;
            loop ((k < 8) && (name[k] != cast<char>(0))) {
                d.symbol[k] = name[k];
                k = k + 1;
            }
            d.symbol[k] = cast<char>(0);
            d.price = this.engine.books[i].reference_price;
            this.emit(&d);
            this.stats.directory = this.stats.directory + 1;
        }
        this.writer.flush();
    }

    frame close(this: *FeedPublisher) {
        local s: ItchMsg = ItchCodec.blank('S', 0, this.stamp());
        s.code = 'C';
        this.emit(&s);
        this.stats.system = this.stats.system + 1;
        this.writer.flush();
    }

    # Executions for trades since the last call; the maker is the resting side.
    frame publishTrades(this: *FeedPublisher) {
        local n: int = this.engine.tape.count;
        local first: int = n;
        loop ((first > 0) && (this.engine.tape.at(first - 1).id > this.last_trade_id)) {
            first = first - 1;
        }
        loop (local i: int = first; i < n; i = i + 1) {
            local t: *Trade = this.engine.tape.at(i);
            local maker: long = t.aggressor == Side.Buy ? t.sell_order : t.buy_order;
            local e: ItchMsg = ItchCodec.blank('E', t.symbol + 1, this.stamp());
            e.ref = maker;
            e.shares = t.quantity;
            e.match_no = t.id;
            this.emit(&e);
            this.stats.executions = this.stats.executions + 1;
            this.last_trade_id = t.id;
        }
    }

    frame announceResting(this: *FeedPublisher, order_id: long) {
        local o: *Order = this.engine.findOrder(order_id);
        if ((o == nullptr) || (o.id != order_id) || !o.isOpen() || (o.remaining <= 0)) {
            return;
        }
        local a: ItchMsg = ItchCodec.blank('A', o.symbol + 1, this.stamp());
        a.ref = o.id;
        a.side = o.side == Side.Buy ? 'B' : 'S';
        a.shares = o.remaining;
        a.price = o.price;
        this.emit(&a);
        this.stats.adds = this.stats.adds + 1;
    }

    # Submits a limit or market order and publishes its effects.
    frame submit(this: *FeedPublisher, req: *OrderRequest) ret ExecReport {
        if ((req.kind != OrderType.Limit) && (req.kind != OrderType.Market)) {
            local r: ExecReport = Engine.emptyReport();
            r.status = OrderStatus.Rejected;
            return r;
        }
        local r: ExecReport = this.engine.submit(req);
        this.publishTrades();
        if (r.resting) {
            this.announceResting(r.order_id);
        }
        return r;
    }

    frame cancel(this: *FeedPublisher, order_id: long) ret bool {
        local o: *Order = this.engine.findOrder(order_id);
        if ((o == nullptr) || (o.id != order_id)) {
            return false;
        }
        local symbol: int = o.symbol;
        if (!this.engine.cancel(order_id)) {
            return false;
        }
        local d: ItchMsg = ItchCodec.blank('D', symbol + 1, this.stamp());
        d.ref = order_id;
        this.emit(&d);
        this.stats.deletes = this.stats.deletes + 1;
        return true;
    }

    # Cancel/replace: a reduction at the same price is a partial cancel
    # (priority kept); anything else deletes and re-adds under a new ref.
    frame replace(this: *FeedPublisher, order_id: long, price: long, quantity: long) ret ExecReport {
        local o: *Order = this.engine.findOrder(order_id);
        if ((o == nullptr) || (o.id != order_id)) {
            return this.engine.replace(order_id, price, quantity);
        }
        local symbol: int = o.symbol;
        local before: long = o.remaining;
        local r: ExecReport = this.engine.replace(order_id, price, quantity);
        if (r.status == OrderStatus.Rejected) {
            return r;
        }
        if (r.order_id == order_id) {
            local x: ItchMsg = ItchCodec.blank('X', symbol + 1, this.stamp());
            x.ref = order_id;
            x.shares = before - r.remaining;
            if (x.shares > 0) {
                this.emit(&x);
                this.stats.cancels = this.stats.cancels + 1;
            }
            return r;
        }
        local d: ItchMsg = ItchCodec.blank('D', symbol + 1, this.stamp());
        d.ref = order_id;
        this.emit(&d);
        this.stats.replaces = this.stats.replaces + 1;
        this.publishTrades();
        if (r.resting) {
            this.announceResting(r.order_id);
        }
        return r;
    }
}

struct FeedLevel {
    price: long,
    shares: long,
    orders: int,
}

struct FeedOrder {
    ref: long,
    locate: int,
    buy: bool,
    price: long,
    shares: long,
    live: bool,
}

# Sorted price levels for one side of one book (best first).
struct FeedSide {
    levels: *FeedLevel,
    count: int,
    cap: int,
    descending: bool,
}

struct FeedBook {
    orders: *FeedOrder,
    order_count: int,
    order_cap: int,
    index: LongMap,
    sides: *FeedSide,
    books: int,
    names: *char,
    stats: FeedStats,
    last_match: long,
    volume: long,
    open: bool,
    closed: bool,

    frame init(this: *FeedBook, max_books: int) {
        this.order_cap = 1024;
        this.orders = cast<*FeedOrder>(malloc(cast<long>(this.order_cap) * sizeof(FeedOrder)));
        this.order_count = 0;
        this.index = LongMap.new(1024);
        this.books = max_books;
        this.sides = cast<*FeedSide>(malloc(cast<long>(max_books * 2) * sizeof(FeedSide)));
        loop (local i: int = 0; i < (max_books * 2); i = i + 1) {
            this.sides[i].cap = 16;
            this.sides[i].count = 0;
            this.sides[i].levels = cast<*FeedLevel>(malloc(16 * sizeof(FeedLevel)));
            this.sides[i].descending = (i % 2) == 0;
        }
        this.names = cast<*char>(malloc(cast<long>(max_books * 9)));
        loop (local i: int = 0; i < max_books; i = i + 1) {
            this.names[i * 9] = cast<char>(0);
        }
        this.stats = FeedStats { adds: 0, executions: 0, cancels: 0, deletes: 0, replaces: 0, trades: 0, system: 0, directory: 0, unknown_refs: 0 };
        this.last_match = 0;
        this.volume = 0;
        this.open = false;
        this.closed = false;
    }

    frame destroy(this: *FeedBook) {
        loop (local i: int = 0; i < (this.books * 2); i = i + 1) {
            free(cast<*void>(this.sides[i].levels));
        }
        free(cast<*void>(this.sides));
        free(cast<*void>(this.orders));
        free(cast<*void>(this.names));
        this.index.destroy();
    }

    frame side(this: *FeedBook, locate: int, buy: bool) ret *FeedSide {
        return this.sides + (((locate - 1) * 2) + (buy ? 0 : 1));
    }

    frame symbol(this: *FeedBook, locate: int) ret string {
        return cast<string>(this.names + ((locate - 1) * 9));
    }

    frame locateOf(this: *FeedBook, name: string) ret int {
        loop (local i: int = 1; i <= this.books; i = i + 1) {
            if (Text.equals(this.symbol(i), name)) {
                return i;
            }
        }
        return -1;
    }

    # Finds or inserts the level for `price` and adds (shares, orders).
    frame adjust(this: *FeedBook, s: *FeedSide, price: long, shares: long, orders: int) {
        local pos: int = 0;
        loop (pos < s.count) {
            local p: long = s.levels[pos].price;
            if (p == price) {
                break;
            }
            local better: bool = s.descending ? p > price : p < price;
            if (!better) {
                break;
            }
            pos = pos + 1;
        }
        if ((pos == s.count) || (s.levels[pos].price != price)) {
            if (s.count == s.cap) {
                local next: *FeedLevel = cast<*FeedLevel>(malloc(cast<long>(s.cap * 2) * sizeof(FeedLevel)));
                loop (local i: int = 0; i < s.count; i = i + 1) {
                    next[i] = s.levels[i];
                }
                free(cast<*void>(s.levels));
                s.levels = next;
                s.cap = s.cap * 2;
            }
            local k: int = s.count;
            loop (k > pos) {
                s.levels[k] = s.levels[k - 1];
                k = k - 1;
            }
            s.levels[pos] = FeedLevel { price: price, shares: 0, orders: 0 };
            s.count = s.count + 1;
        }
        s.levels[pos].shares = s.levels[pos].shares + shares;
        s.levels[pos].orders = s.levels[pos].orders + orders;
        if (s.levels[pos].orders <= 0) {
            loop (local i: int = pos + 1; i < s.count; i = i + 1) {
                s.levels[i - 1] = s.levels[i];
            }
            s.count = s.count - 1;
        }
    }

    frame findOrder(this: *FeedBook, ref: long) ret *FeedOrder {
        local i: long = this.index.getOr(ref, -1);
        if (i < 0) {
            this.stats.unknown_refs = this.stats.unknown_refs + 1;
            return nullptr;
        }
        return this.orders + cast<int>(i);
    }

    frame addOrder(this: *FeedBook, m: *ItchMsg) {
        if (this.order_count == this.order_cap) {
            local next: *FeedOrder = cast<*FeedOrder>(malloc(cast<long>(this.order_cap * 2) * sizeof(FeedOrder)));
            loop (local i: int = 0; i < this.order_count; i = i + 1) {
                next[i] = this.orders[i];
            }
            free(cast<*void>(this.orders));
            this.orders = next;
            this.order_cap = this.order_cap * 2;
        }
        local buy: bool = m.side == 'B';
        this.orders[this.order_count] = FeedOrder { ref: m.ref, locate: m.locate, buy: buy, price: m.price, shares: m.shares, live: true };
        this.index.put(m.ref, cast<long>(this.order_count));
        this.order_count = this.order_count + 1;
        this.adjust(this.side(m.locate, buy), m.price, m.shares, 1);
    }

    # Removes `shares` from an order; deletes it when nothing is left.
    frame reduceOrder(this: *FeedBook, o: *FeedOrder, shares: long) {
        local take: long = shares > o.shares ? o.shares : shares;
        o.shares = o.shares - take;
        local gone: bool = o.shares == 0;
        this.adjust(this.side(o.locate, o.buy), o.price, -take, gone ? -1 : 0);
        if (gone) {
            o.live = false;
            this.index.remove(o.ref);
        }
    }

    frame apply(this: *FeedBook, m: *ItchMsg) {
        if ((m.kind != 'S') && ((m.locate < 1) || (m.locate > this.books))) {
            this.stats.unknown_refs = this.stats.unknown_refs + 1;
            return;
        }
        if (m.kind == 'S') {
            this.stats.system = this.stats.system + 1;
            if (m.code == 'O') {
                this.open = true;
            } else if (m.code == 'C') {
                this.closed = true;
            }
        } else if (m.kind == 'R') {
            local dst: *char = this.names + ((m.locate - 1) * 9);
            loop (local k: int = 0; k < 9; k = k + 1) {
                dst[k] = m.symbol[k];
            }
            this.stats.directory = this.stats.directory + 1;
        } else if (m.kind == 'A') {
            this.addOrder(m);
            this.stats.adds = this.stats.adds + 1;
        } else if (m.kind == 'E') {
            local o: *FeedOrder = this.findOrder(m.ref);
            if (o != nullptr) {
                this.reduceOrder(o, m.shares);
                this.volume = this.volume + m.shares;
                this.last_match = m.match_no;
            }
            this.stats.executions = this.stats.executions + 1;
        } else if (m.kind == 'X') {
            local o: *FeedOrder = this.findOrder(m.ref);
            if (o != nullptr) {
                this.reduceOrder(o, m.shares);
            }
            this.stats.cancels = this.stats.cancels + 1;
        } else if (m.kind == 'D') {
            local o: *FeedOrder = this.findOrder(m.ref);
            if (o != nullptr) {
                this.reduceOrder(o, o.shares);
            }
            this.stats.deletes = this.stats.deletes + 1;
        } else if (m.kind == 'U') {
            local o: *FeedOrder = this.findOrder(m.ref);
            if (o != nullptr) {
                local buy: bool = o.buy;
                this.reduceOrder(o, o.shares);
                local add: ItchMsg = *m;
                add.ref = m.new_ref;
                add.side = buy ? 'B' : 'S';
                this.addOrder(&add);
            }
            this.stats.replaces = this.stats.replaces + 1;
        } else if (m.kind == 'P') {
            this.volume = this.volume + m.shares;
            this.stats.trades = this.stats.trades + 1;
        }
    }

    frame liveOrders(this: *FeedBook) ret int {
        return this.index.count;
    }

    frame bestBid(this: *FeedBook, locate: int) ret long {
        local s: *FeedSide = this.side(locate, true);
        return s.count > 0 ? s.levels[0].price : 0;
    }

    frame bestAsk(this: *FeedBook, locate: int) ret long {
        local s: *FeedSide = this.side(locate, false);
        return s.count > 0 ? s.levels[0].price : 0;
    }

    frame depth(this: *FeedBook, locate: int, buy: bool, out: *FeedLevel, max_levels: int) ret int {
        local s: *FeedSide = this.side(locate, buy);
        local n: int = s.count < max_levels ? s.count : max_levels;
        loop (local i: int = 0; i < n; i = i + 1) {
            out[i] = s.levels[i];
        }
        return n;
    }

    # Compares this rebuilt book with the engine's book for `symbol`;
    # returns the number of mismatching levels (0 = identical).
    frame compare(this: *FeedBook, engine: *Engine, symbol: int) ret int {
        local book: *OrderBook = engine.book(symbol);
        local mismatches: int = 0;
        loop (local side: int = 0; side < 2; side = side + 1) {
            local buy: bool = side == 0;
            local mine: *FeedSide = this.side(symbol + 1, buy);
            local theirs: *DepthLevel = cast<*DepthLevel>(malloc(cast<long>(mine.count + 1 + (buy ? book.bids.count : book.asks.count)) * sizeof(DepthLevel)));
            local n: int = book.depth(buy ? Side.Buy : Side.Sell, theirs, 1000000);
            if (n != mine.count) {
                mismatches = mismatches + 1 + (n > mine.count ? n - mine.count : mine.count - n);
            }
            local k: int = n < mine.count ? n : mine.count;
            loop (local i: int = 0; i < k; i = i + 1) {
                local a: *FeedLevel = mine.levels + i;
                local b: *DepthLevel = theirs + i;
                if ((a.price != b.price) || (a.shares != b.quantity) || (a.orders != b.orders)) {
                    mismatches = mismatches + 1;
                }
            }
            free(cast<*void>(theirs));
        }
        return mismatches;
    }

    frame levels(this: *FeedBook, locate: int, buy: bool) ret int {
        return this.side(locate, buy).count;
    }
}
