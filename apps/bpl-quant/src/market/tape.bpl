# Trade tape: a fixed-capacity ring buffer of the most recent trades, plus
# running totals for every trade ever recorded.

import malloc, free from "std/c.bpl";
import [Trade], [Side] from "./order.bpl";

export [TradeTape];

struct TradeTape {
    trades: *Trade,
    cap: int,
    start: int,
    count: int,
    total: long,
    total_volume: long,

    frame new(capacity: int) ret TradeTape {
        local t: TradeTape;
        t.cap = capacity < 16 ? 16 : capacity;
        t.trades = cast<*Trade>(malloc(cast<long>(t.cap) * sizeof(Trade)));
        t.start = 0;
        t.count = 0;
        t.total = 0;
        t.total_volume = 0;
        return t;
    }

    frame destroy(this: *TradeTape) {
        if (this.trades != nullptr) {
            free(cast<*void>(this.trades));
            this.trades = nullptr;
        }
        this.count = 0;
    }

    frame push(this: *TradeTape, t: Trade) {
        local pos: int = (this.start + this.count) % this.cap;
        if (this.count == this.cap) {
            this.trades[this.start] = t;
            this.start = (this.start + 1) % this.cap;
        } else {
            this.trades[pos] = t;
            this.count = this.count + 1;
        }
        this.total = this.total + 1;
        this.total_volume = this.total_volume + t.quantity;
    }

    # i = 0 is the oldest retained trade.
    frame at(this: *TradeTape, i: int) ret *Trade {
        return this.trades + ((this.start + i) % this.cap);
    }

    frame latest(this: *TradeTape) ret *Trade {
        if (this.count == 0) {
            return nullptr;
        }
        return this.at(this.count - 1);
    }

    # Copies up to `limit` most recent trades for `symbol` (-1 = all), newest first.
    frame recent(this: *TradeTape, symbol: int, limit: int, out: *Trade) ret int {
        local n: int = 0;
        local i: int = this.count - 1;
        loop ((i >= 0) && (n < limit)) {
            local t: *Trade = this.at(i);
            if ((symbol < 0) || (t.symbol == symbol)) {
                out[n] = *t;
                n = n + 1;
            }
            i = i - 1;
        }
        return n;
    }

    frame clear(this: *TradeTape) {
        this.start = 0;
        this.count = 0;
    }

    # Signed volume (buyer-initiated minus seller-initiated) over retained trades.
    frame orderFlow(this: *TradeTape, symbol: int) ret long {
        local flow: long = 0;
        loop (local i: int = 0; i < this.count; i = i + 1) {
            local t: *Trade = this.at(i);
            if (t.symbol == symbol) {
                if (t.aggressor == Side.Buy) {
                    flow = flow + t.quantity;
                } else {
                    flow = flow - t.quantity;
                }
            }
        }
        return flow;
    }
}
