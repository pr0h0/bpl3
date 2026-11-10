# In-memory time-series store: one bar series per symbol plus a live
# aggregator fed by the matching engine's trade tape.

import malloc, free from "std/c.bpl";
import [BarSeries], [Bar], [BarAggregator], [BarMode] from "./bars.bpl";
import [StrIndex] from "../core/hashmap.bpl";

export [SeriesStore];
export [SeriesEntry];

struct SeriesEntry {
    bars: BarSeries,
    live: BarAggregator,
    last_trade_seq: long,
}

struct SeriesStore {
    names: StrIndex,
    entries: *SeriesEntry,
    count: int,
    cap: int,
    interval: long,

    frame new(interval: long) ret SeriesStore {
        local s: SeriesStore;
        s.names = StrIndex.new(16);
        s.cap = 16;
        s.entries = cast<*SeriesEntry>(malloc(cast<long>(s.cap) * sizeof(SeriesEntry)));
        s.count = 0;
        s.interval = interval;
        return s;
    }

    frame destroy(this: *SeriesStore) {
        loop (local i: int = 0; i < this.count; i = i + 1) {
            this.entries[i].bars.destroy();
            this.entries[i].live.destroy();
        }
        free(cast<*void>(this.entries));
        this.entries = nullptr;
        this.names.destroy();
        this.count = 0;
    }

    frame find(this: *SeriesStore, symbol: string) ret *SeriesEntry {
        local id: int = this.names.find(symbol);
        if (id < 0) {
            return nullptr;
        }
        return this.entries + id;
    }

    frame ensure(this: *SeriesStore, symbol: string) ret *SeriesEntry {
        local id: int = this.names.find(symbol);
        if (id >= 0) {
            return this.entries + id;
        }
        id = this.names.intern(symbol);
        if (this.count == this.cap) {
            local next_cap: int = this.cap * 2;
            local next: *SeriesEntry = cast<*SeriesEntry>(malloc(cast<long>(next_cap) * sizeof(SeriesEntry)));
            loop (local i: int = 0; i < this.count; i = i + 1) {
                next[i] = this.entries[i];
            }
            free(cast<*void>(this.entries));
            this.entries = next;
            this.cap = next_cap;
        }
        local e: *SeriesEntry = this.entries + id;
        e.bars = BarSeries.new(256, this.interval);
        e.live = BarAggregator.new(BarMode.Time, this.interval);
        e.last_trade_seq = 0;
        this.count = this.count + 1;
        return e;
    }

    # Replaces a symbol's history with `series` (ownership moves into the store).
    frame load(this: *SeriesStore, symbol: string, series: BarSeries) {
        local e: *SeriesEntry = this.ensure(symbol);
        e.bars.destroy();
        e.bars = series;
    }

    frame append(this: *SeriesStore, symbol: string, bar: Bar) ret bool {
        local e: *SeriesEntry = this.ensure(symbol);
        if ((e.bars.len > 0) && (bar.time <= e.bars.time[e.bars.len - 1])) {
            return false;
        }
        e.bars.push(bar);
        return true;
    }

    # Feeds one trade into the live aggregator; completed bars move to history.
    frame onTrade(this: *SeriesStore, symbol: string, time: long, price: float, size: float) {
        local e: *SeriesEntry = this.ensure(symbol);
        local before: int = e.live.series.len;
        e.live.add(time, price, size);
        if (e.live.series.len > before) {
            this.drain(e);
        }
    }

    frame drain(this: *SeriesStore, e: *SeriesEntry) {
        loop (local i: int = 0; i < e.live.series.len; i = i + 1) {
            local b: Bar = e.live.series.at(i);
            if ((e.bars.len == 0) || (b.time > e.bars.time[e.bars.len - 1])) {
                e.bars.push(b);
            }
        }
        e.live.series.len = 0;
    }

    frame flush(this: *SeriesStore) {
        loop (local i: int = 0; i < this.count; i = i + 1) {
            local e: *SeriesEntry = this.entries + i;
            e.live.flush();
            this.drain(e);
        }
    }

    frame symbolAt(this: *SeriesStore, i: int) ret string {
        return this.names.name(i);
    }

    frame totalBars(this: *SeriesStore) ret long {
        local n: long = 0;
        loop (local i: int = 0; i < this.count; i = i + 1) {
            n = n + cast<long>(this.entries[i].bars.len);
        }
        return n;
    }
}
