# Position ledger: per-account, per-symbol positions built from trades with
# FIFO lot matching, realized and unrealized P&L, fees and exposure limits.

import malloc, free from "std/c.bpl";
import [Math] from "std/math.bpl";
import [Trade], [Side], [Ticks] from "./order.bpl";
import [Engine] from "./engine.bpl";
import [OrderBook] from "./book.bpl";

export [Ledger];
export [Position];
export [Lot];
export [AccountSummary];

struct Lot {
    quantity: long,
    price: float,
    next: int,
}

struct Position {
    account: int,
    symbol: int,
    quantity: long,
    realized: float,
    fees: float,
    traded_volume: long,
    trades: long,
    # FIFO queue of open lots (pool indices); all lots share the position's sign.
    head: int,
    tail: int,
}

struct AccountSummary {
    account: int,
    positions: int,
    gross_exposure: float,
    net_exposure: float,
    realized: float,
    unrealized: float,
    fees: float,
    equity: float,
}

struct Ledger {
    positions: *Position,
    count: int,
    cap: int,
    lots: *Lot,
    lot_count: int,
    lot_cap: int,
    free_lot: int,
    fee_bps: float,
    processed: long,
    # Accounts x symbols index (dense, sized lazily).
    index: *int,
    index_accounts: int,
    index_symbols: int,

    frame new(fee_bps: float) ret Ledger {
        local l: Ledger;
        l.cap = 64;
        l.count = 0;
        l.positions = cast<*Position>(malloc(cast<long>(l.cap) * sizeof(Position)));
        l.lot_cap = 256;
        l.lot_count = 0;
        l.lots = cast<*Lot>(malloc(cast<long>(l.lot_cap) * sizeof(Lot)));
        l.free_lot = -1;
        l.fee_bps = fee_bps;
        l.processed = 0;
        l.index = nullptr;
        l.index_accounts = 0;
        l.index_symbols = 0;
        return l;
    }

    frame destroy(this: *Ledger) {
        free(cast<*void>(this.positions));
        free(cast<*void>(this.lots));
        if (this.index != nullptr) {
            free(cast<*void>(this.index));
        }
        this.positions = nullptr;
    }

    frame reindex(this: *Ledger, accounts: int, symbols: int) {
        local na: int = accounts > this.index_accounts ? accounts * 2 : this.index_accounts;
        local ns: int = symbols > this.index_symbols ? symbols * 2 : this.index_symbols;
        if (na < 8) {
            na = 8;
        }
        if (ns < 4) {
            ns = 4;
        }
        local next: *int = cast<*int>(malloc(cast<long>(na) * cast<long>(ns) * sizeof(int)));
        loop (local i: int = 0; i < (na * ns); i = i + 1) {
            next[i] = -1;
        }
        loop (local p: int = 0; p < this.count; p = p + 1) {
            next[(this.positions[p].account * ns) + this.positions[p].symbol] = p;
        }
        if (this.index != nullptr) {
            free(cast<*void>(this.index));
        }
        this.index = next;
        this.index_accounts = na;
        this.index_symbols = ns;
    }

    frame position(this: *Ledger, account: int, symbol: int) ret *Position {
        if ((account >= this.index_accounts) || (symbol >= this.index_symbols)) {
            this.reindex(account + 1, symbol + 1);
        }
        local slot: int = (account * this.index_symbols) + symbol;
        local p: int = this.index[slot];
        if (p >= 0) {
            return this.positions + p;
        }
        if (this.count == this.cap) {
            local next_cap: int = this.cap * 2;
            local next: *Position = cast<*Position>(malloc(cast<long>(next_cap) * sizeof(Position)));
            loop (local i: int = 0; i < this.count; i = i + 1) {
                next[i] = this.positions[i];
            }
            free(cast<*void>(this.positions));
            this.positions = next;
            this.cap = next_cap;
        }
        p = this.count;
        this.count = this.count + 1;
        this.positions[p] = Position { account: account, symbol: symbol, quantity: 0, realized: 0.0, fees: 0.0, traded_volume: 0, trades: 0, head: -1, tail: -1 };
        this.index[slot] = p;
        return this.positions + p;
    }

    frame newLot(this: *Ledger, quantity: long, price: float) ret int {
        local idx: int = -1;
        if (this.free_lot >= 0) {
            idx = this.free_lot;
            this.free_lot = this.lots[idx].next;
        } else {
            if (this.lot_count == this.lot_cap) {
                local next_cap: int = this.lot_cap * 2;
                local next: *Lot = cast<*Lot>(malloc(cast<long>(next_cap) * sizeof(Lot)));
                loop (local i: int = 0; i < this.lot_count; i = i + 1) {
                    next[i] = this.lots[i];
                }
                free(cast<*void>(this.lots));
                this.lots = next;
                this.lot_cap = next_cap;
            }
            idx = this.lot_count;
            this.lot_count = this.lot_count + 1;
        }
        this.lots[idx] = Lot { quantity: quantity, price: price, next: -1 };
        return idx;
    }

    # Applies a signed fill (positive = buy) at price to one position.
    frame fill(this: *Ledger, p: *Position, signed_qty: long, price: float) {
        local fee: float = (Math.abs(cast<float>(signed_qty)) * price * this.fee_bps) / 10000.0;
        p.fees = p.fees + fee;
        p.realized = p.realized - fee;
        p.traded_volume = p.traded_volume + (signed_qty < 0 ? -signed_qty : signed_qty);
        p.trades = p.trades + 1;
        local remaining: long = signed_qty;
        # Close opposite-signed lots first (FIFO).
        loop ((remaining != 0) && (p.head >= 0) && (((p.quantity > 0) && (remaining < 0)) || ((p.quantity < 0) && (remaining > 0)))) {
            local lot: *Lot = this.lots + p.head;
            local lot_qty: long = lot.quantity;
            local close: long = Math.abs(cast<float>(remaining)) < Math.abs(cast<float>(lot_qty)) ? -remaining : lot_qty;
            # close has the lot's sign; realized = closed quantity * (exit - entry).
            p.realized = p.realized + (cast<float>(close) * (price - lot.price));
            lot.quantity = lot.quantity - close;
            p.quantity = p.quantity - close;
            remaining = remaining + close;
            if (lot.quantity == 0) {
                local done: int = p.head;
                p.head = lot.next;
                if (p.head < 0) {
                    p.tail = -1;
                }
                this.lots[done].next = this.free_lot;
                this.free_lot = done;
            }
        }
        if (remaining != 0) {
            local idx: int = this.newLot(remaining, price);
            if (p.tail >= 0) {
                this.lots[p.tail].next = idx;
            } else {
                p.head = idx;
            }
            p.tail = idx;
            p.quantity = p.quantity + remaining;
        }
    }

    frame applyTrade(this: *Ledger, t: *Trade) {
        local price: float = Ticks.toFloat(t.price);
        local buyer: *Position = this.position(t.buy_account, t.symbol);
        this.fill(buyer, t.quantity, price);
        local seller: *Position = this.position(t.sell_account, t.symbol);
        this.fill(seller, -t.quantity, price);
        this.processed = t.id;
    }

    # Catches up with the engine's tape (trades newer than the last processed id).
    frame sync(this: *Ledger, e: *Engine) ret int {
        local applied: int = 0;
        loop (local i: int = 0; i < e.tape.count; i = i + 1) {
            local t: *Trade = e.tape.at(i);
            if (t.id > this.processed) {
                this.applyTrade(t);
                applied = applied + 1;
            }
        }
        return applied;
    }

    frame averageCost(this: *Ledger, p: *Position) ret float {
        if (p.quantity == 0) {
            return 0.0;
        }
        local cost: float = 0.0;
        local cur: int = p.head;
        loop (cur >= 0) {
            cost = cost + (cast<float>(this.lots[cur].quantity) * this.lots[cur].price);
            cur = this.lots[cur].next;
        }
        return cost / cast<float>(p.quantity);
    }

    frame unrealized(this: *Ledger, p: *Position, mark: float) ret float {
        if (p.quantity == 0) {
            return 0.0;
        }
        return cast<float>(p.quantity) * (mark - this.averageCost(p));
    }

    frame markPrice(e: *Engine, symbol: int) ret float {
        local b: *OrderBook = e.book(symbol);
        if ((b.bids.count > 0) && (b.asks.count > 0)) {
            return b.mid() / 10000.0;
        }
        if (b.last_price > 0) {
            return Ticks.toFloat(b.last_price);
        }
        return Ticks.toFloat(b.reference_price);
    }

    frame summary(this: *Ledger, e: *Engine, account: int) ret AccountSummary {
        local s: AccountSummary = AccountSummary { account: account, positions: 0, gross_exposure: 0.0, net_exposure: 0.0, realized: 0.0, unrealized: 0.0, fees: 0.0, equity: 0.0 };
        loop (local i: int = 0; i < this.count; i = i + 1) {
            local p: *Position = this.positions + i;
            if (p.account != account) {
                continue;
            }
            local mark: float = Ledger.markPrice(e, p.symbol);
            local value: float = cast<float>(p.quantity) * mark;
            if (p.quantity != 0) {
                s.positions = s.positions + 1;
            }
            s.gross_exposure = s.gross_exposure + Math.abs(value);
            s.net_exposure = s.net_exposure + value;
            s.realized = s.realized + p.realized;
            s.unrealized = s.unrealized + this.unrealized(p, mark);
            s.fees = s.fees + p.fees;
        }
        s.equity = s.realized + s.unrealized;
        return s;
    }

    # Sum of signed quantities across accounts for a symbol: always zero.
    frame netQuantity(this: *Ledger, symbol: int) ret long {
        local q: long = 0;
        loop (local i: int = 0; i < this.count; i = i + 1) {
            if (this.positions[i].symbol == symbol) {
                q = q + this.positions[i].quantity;
            }
        }
        return q;
    }

    # Total realized + unrealized P&L before fees nets to zero across accounts.
    frame grossPnl(this: *Ledger, e: *Engine) ret float {
        local total: float = 0.0;
        loop (local i: int = 0; i < this.count; i = i + 1) {
            local p: *Position = this.positions + i;
            total = total + p.realized + p.fees + this.unrealized(p, Ledger.markPrice(e, p.symbol));
        }
        return total;
    }
}
