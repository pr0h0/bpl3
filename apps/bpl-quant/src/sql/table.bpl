# Columnar tables for QQL.
#
# Each column is either numeric (*float) or text (*string, borrowed from the
# source). Tables are materialized per query from the live engine and series
# store, so a query sees a consistent snapshot.

import malloc, free from "std/c.bpl";
import [Text] from "../core/text.bpl";
import [Engine] from "../market/engine.bpl";
import [Trade], [Order], [Ticks], [Side] from "../market/order.bpl";
import [OrderBook], [BookSide] from "../market/book.bpl";
import [SeriesStore], [SeriesEntry] from "../series/store.bpl";
import [BarSeries] from "../series/bars.bpl";

export [Table];
export [Tables];

global const MAX_COLUMNS: int = 16;

struct Table {
    names: string[16],
    numeric: bool[16],
    nums: *float[16],
    texts: *string[16],
    columns: int,
    rows: int,
    cap: int,

    frame create(this: *Table, cap: int) {
        this.columns = 0;
        this.rows = 0;
        this.cap = cap < 1 ? 1 : cap;
    }

    frame destroy(this: *Table) {
        loop (local i: int = 0; i < this.columns; i = i + 1) {
            if (this.numeric[i]) {
                free(cast<*void>(this.nums[i]));
            } else {
                free(cast<*void>(this.texts[i]));
            }
        }
        this.columns = 0;
    }

    frame addNumeric(this: *Table, name: string) ret int {
        local c: int = this.columns;
        this.names[c] = name;
        this.numeric[c] = true;
        this.nums[c] = cast<*float>(malloc(cast<long>(this.cap) * sizeof(float)));
        this.texts[c] = nullptr;
        this.columns = c + 1;
        return c;
    }

    frame addText(this: *Table, name: string) ret int {
        local c: int = this.columns;
        this.names[c] = name;
        this.numeric[c] = false;
        this.texts[c] = cast<*string>(malloc(cast<long>(this.cap) * sizeof(string)));
        this.nums[c] = nullptr;
        this.columns = c + 1;
        return c;
    }

    frame find(this: *Table, name: string) ret int {
        loop (local i: int = 0; i < this.columns; i = i + 1) {
            if (Text.equals(this.names[i], name)) {
                return i;
            }
        }
        return -1;
    }

    frame num(this: *Table, col: int, row: int) ret float {
        return this.nums[col][row];
    }

    frame text(this: *Table, col: int, row: int) ret string {
        return this.texts[col][row];
    }
}

struct Tables {
    frame names() ret string {
        return "trades, bars('SYMBOL'), orders, symbols";
    }

    frame trades(engine: *Engine, out: *Table) {
        local n: int = engine.tape.count;
        out.create(n);
        local id: int = out.addNumeric("id");
        local sym: int = out.addText("symbol");
        local price: int = out.addNumeric("price");
        local qty: int = out.addNumeric("qty");
        local side: int = out.addText("side");
        local buyer: int = out.addText("buyer");
        local seller: int = out.addText("seller");
        local time: int = out.addNumeric("time");
        local notional: int = out.addNumeric("notional");
        loop (local i: int = 0; i < n; i = i + 1) {
            local t: *Trade = engine.tape.at(i);
            out.nums[id][i] = cast<float>(t.id);
            out.texts[sym][i] = engine.symbolName(t.symbol);
            out.nums[price][i] = Ticks.toFloat(t.price);
            out.nums[qty][i] = cast<float>(t.quantity);
            out.texts[side][i] = Ticks.sideName(t.aggressor);
            out.texts[buyer][i] = engine.accounts.name(t.buy_account);
            out.texts[seller][i] = engine.accounts.name(t.sell_account);
            out.nums[time][i] = cast<float>(t.timestamp);
            out.nums[notional][i] = Ticks.toFloat(t.price) * cast<float>(t.quantity);
        }
        out.rows = n;
    }

    frame bars(series: *BarSeries, out: *Table) {
        local n: int = series.len;
        out.create(n);
        local time: int = out.addNumeric("time");
        local open: int = out.addNumeric("open");
        local high: int = out.addNumeric("high");
        local low: int = out.addNumeric("low");
        local close: int = out.addNumeric("close");
        local volume: int = out.addNumeric("volume");
        local vwap: int = out.addNumeric("vwap");
        local ret_col: int = out.addNumeric("return");
        local range: int = out.addNumeric("range");
        loop (local i: int = 0; i < n; i = i + 1) {
            out.nums[time][i] = cast<float>(series.time[i]);
            out.nums[open][i] = series.open[i];
            out.nums[high][i] = series.high[i];
            out.nums[low][i] = series.low[i];
            out.nums[close][i] = series.close[i];
            out.nums[volume][i] = series.volume[i];
            out.nums[vwap][i] = series.vwap[i];
            out.nums[ret_col][i] = i > 0 ? (series.close[i] / series.close[i - 1]) - 1.0 : 0.0 / 0.0;
            out.nums[range][i] = series.high[i] - series.low[i];
        }
        out.rows = n;
    }

    # Resting orders across all books, bids then asks, best price first.
    frame orders(engine: *Engine, out: *Table) {
        local n: int = engine.pool.live;
        out.create(n);
        local id: int = out.addNumeric("id");
        local sym: int = out.addText("symbol");
        local account: int = out.addText("account");
        local side: int = out.addText("side");
        local price: int = out.addNumeric("price");
        local qty: int = out.addNumeric("qty");
        local remaining: int = out.addNumeric("remaining");
        local level: int = out.addNumeric("level");
        local row: int = 0;
        loop (local s: int = 0; s < engine.book_count; s = s + 1) {
            local b: *OrderBook = engine.book(s);
            loop (local sd: int = 0; sd < 2; sd = sd + 1) {
                local bs: *BookSide = sd == 0 ? &b.bids : &b.asks;
                loop (local l: int = 0; l < bs.count; l = l + 1) {
                    local cur: int = bs.levels[l].head;
                    loop ((cur >= 0) && (row < n)) {
                        local o: *Order = engine.pool.at(cur);
                        out.nums[id][row] = cast<float>(o.id);
                        out.texts[sym][row] = engine.symbolName(o.symbol);
                        out.texts[account][row] = engine.accounts.name(o.account);
                        out.texts[side][row] = Ticks.sideName(o.side);
                        out.nums[price][row] = Ticks.toFloat(o.price);
                        out.nums[qty][row] = cast<float>(o.quantity);
                        out.nums[remaining][row] = cast<float>(o.remaining);
                        out.nums[level][row] = cast<float>(l);
                        row = row + 1;
                        cur = o.next;
                    }
                }
            }
        }
        out.rows = row;
    }

    frame symbols(engine: *Engine, series: *SeriesStore, out: *Table) {
        local n: int = engine.book_count;
        out.create(n);
        local sym: int = out.addText("symbol");
        local last: int = out.addNumeric("last");
        local bid: int = out.addNumeric("bid");
        local ask: int = out.addNumeric("ask");
        local volume: int = out.addNumeric("volume");
        local trades: int = out.addNumeric("trades");
        local bars: int = out.addNumeric("bars");
        local close: int = out.addNumeric("close");
        loop (local i: int = 0; i < n; i = i + 1) {
            local b: *OrderBook = engine.book(i);
            local name: string = engine.symbolName(i);
            out.texts[sym][i] = name;
            out.nums[last][i] = Ticks.toFloat(b.last_price);
            out.nums[bid][i] = Ticks.toFloat(b.bestBid());
            out.nums[ask][i] = Ticks.toFloat(b.bestAsk());
            out.nums[volume][i] = cast<float>(b.volume);
            out.nums[trades][i] = cast<float>(b.trade_count);
            local e: *SeriesEntry = series.find(name);
            out.nums[bars][i] = e == nullptr ? 0.0 : cast<float>(e.bars.len);
            out.nums[close][i] = (e == nullptr) || (e.bars.len == 0) ? 0.0 / 0.0 : e.bars.close[e.bars.len - 1];
        }
        out.rows = n;
    }
}
