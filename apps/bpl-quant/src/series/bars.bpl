# OHLCV bars and tick-to-bar aggregation.
#
# A BarSeries owns parallel column buffers (struct-of-arrays), which keeps the
# indicator loops cache friendly. BarAggregator turns a stream of trades into
# time bars, volume bars or tick bars; resample() rolls bars up to a coarser
# interval.

import malloc, free, memcpy from "std/c.bpl";
import [Math] from "std/math.bpl";
import [Xoshiro] from "../core/prng.bpl";

export [Bar];
export [BarSeries];
export [BarAggregator];
export [BarMode];

struct Bar {
    time: long,
    open: float,
    high: float,
    low: float,
    close: float,
    volume: float,
    trades: long,
    vwap: float,
}

enum BarMode {
    Time,
    Volume,
    Ticks,
}

struct BarSeries {
    time: *long,
    open: *float,
    high: *float,
    low: *float,
    close: *float,
    volume: *float,
    trades: *long,
    vwap: *float,
    len: int,
    cap: int,
    interval: long,

    frame new(capacity: int, interval: long) ret BarSeries {
        local s: BarSeries;
        s.cap = capacity < 16 ? 16 : capacity;
        s.len = 0;
        s.interval = interval;
        s.allocate(s.cap);
        return s;
    }

    frame allocate(this: *BarSeries, cap: int) {
        local n: long = cast<long>(cap);
        this.time = cast<*long>(malloc(n * sizeof(long)));
        this.open = cast<*float>(malloc(n * sizeof(float)));
        this.high = cast<*float>(malloc(n * sizeof(float)));
        this.low = cast<*float>(malloc(n * sizeof(float)));
        this.close = cast<*float>(malloc(n * sizeof(float)));
        this.volume = cast<*float>(malloc(n * sizeof(float)));
        this.trades = cast<*long>(malloc(n * sizeof(long)));
        this.vwap = cast<*float>(malloc(n * sizeof(float)));
    }

    frame release(this: *BarSeries) {
        if (this.time != nullptr) {
            free(cast<*void>(this.time));
            free(cast<*void>(this.open));
            free(cast<*void>(this.high));
            free(cast<*void>(this.low));
            free(cast<*void>(this.close));
            free(cast<*void>(this.volume));
            free(cast<*void>(this.trades));
            free(cast<*void>(this.vwap));
        }
        this.time = nullptr;
    }

    frame destroy(this: *BarSeries) {
        this.release();
        this.len = 0;
        this.cap = 0;
    }

    frame copyFloats(dst: *float, src: *float, n: int) {
        if (n > 0) {
            memcpy(cast<*void>(dst), cast<*void>(src), cast<long>(n) * sizeof(float));
        }
    }

    frame grow(this: *BarSeries) {
        local old: BarSeries = *this;
        local next_cap: int = this.cap * 2;
        this.allocate(next_cap);
        local n: int = this.len;
        if (n > 0) {
            memcpy(cast<*void>(this.time), cast<*void>(old.time), cast<long>(n) * sizeof(long));
            memcpy(cast<*void>(this.trades), cast<*void>(old.trades), cast<long>(n) * sizeof(long));
        }
        BarSeries.copyFloats(this.open, old.open, n);
        BarSeries.copyFloats(this.high, old.high, n);
        BarSeries.copyFloats(this.low, old.low, n);
        BarSeries.copyFloats(this.close, old.close, n);
        BarSeries.copyFloats(this.volume, old.volume, n);
        BarSeries.copyFloats(this.vwap, old.vwap, n);
        old.release();
        this.cap = next_cap;
    }

    frame push(this: *BarSeries, b: Bar) {
        if (this.len == this.cap) {
            this.grow();
        }
        local i: int = this.len;
        this.time[i] = b.time;
        this.open[i] = b.open;
        this.high[i] = b.high;
        this.low[i] = b.low;
        this.close[i] = b.close;
        this.volume[i] = b.volume;
        this.trades[i] = b.trades;
        this.vwap[i] = b.vwap;
        this.len = this.len + 1;
    }

    frame at(this: *BarSeries, i: int) ret Bar {
        return Bar { time: this.time[i], open: this.open[i], high: this.high[i], low: this.low[i], close: this.close[i], volume: this.volume[i], trades: this.trades[i], vwap: this.vwap[i] };
    }

    frame last(this: *BarSeries) ret Bar {
        return this.at(this.len - 1);
    }

    # Index of the first bar with time >= t (binary search; bars are time ordered).
    frame indexAtOrAfter(this: *BarSeries, t: long) ret int {
        local lo: int = 0;
        local hi: int = this.len;
        loop (lo < hi) {
            local mid: int = (lo + hi) >> 1;
            if (this.time[mid] < t) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        return lo;
    }

    frame typicalPrice(this: *BarSeries, i: int) ret float {
        return (this.high[i] + this.low[i] + this.close[i]) / 3.0;
    }

    frame trueRange(this: *BarSeries, i: int) ret float {
        local hl: float = this.high[i] - this.low[i];
        if (i == 0) {
            return hl;
        }
        local hc: float = Math.abs(this.high[i] - this.close[i - 1]);
        local lc: float = Math.abs(this.low[i] - this.close[i - 1]);
        return Math.max(hl, Math.max(hc, lc));
    }

    # Rolls bars up into buckets of `interval` time units.
    frame resample(this: *BarSeries, interval: long) ret BarSeries {
        local out: BarSeries = BarSeries.new((this.len / 2) + 1, interval);
        local i: int = 0;
        loop (i < this.len) {
            local bucket: long = (this.time[i] / interval) * interval;
            local b: Bar = Bar { time: bucket, open: this.open[i], high: this.high[i], low: this.low[i], close: this.close[i], volume: 0.0, trades: 0, vwap: 0.0 };
            local notional: float = 0.0;
            loop ((i < this.len) && (((this.time[i] / interval) * interval) == bucket)) {
                if (this.high[i] > b.high) {
                    b.high = this.high[i];
                }
                if (this.low[i] < b.low) {
                    b.low = this.low[i];
                }
                b.close = this.close[i];
                b.volume = b.volume + this.volume[i];
                b.trades = b.trades + this.trades[i];
                notional = notional + (this.vwap[i] * this.volume[i]);
                i = i + 1;
            }
            b.vwap = b.volume > 0.0 ? notional / b.volume : b.close;
            out.push(b);
        }
        return out;
    }

    # Synthetic GBM bars with intrabar high/low from a Brownian bridge sketch.
    frame synthetic(seed: u64, count: int, start_price: float, drift: float, vol: float, interval: long) ret BarSeries {
        local rng: Xoshiro = Xoshiro.new(seed);
        local s: BarSeries = BarSeries.new(count, interval);
        local price: float = start_price;
        local dt: float = 1.0 / 252.0;
        loop (local i: int = 0; i < count; i = i + 1) {
            local open: float = price;
            local steps: int = 8;
            local hi: float = open;
            local lo: float = open;
            local p: float = open;
            local notional: float = 0.0;
            local vol_total: float = 0.0;
            loop (local k: int = 0; k < steps; k = k + 1) {
                p = p * Math.exp((((drift - (0.5 * vol * vol)) * dt) / cast<float>(steps)) + (vol * Math.sqrt(dt / cast<float>(steps)) * rng.normal()));
                if (p > hi) {
                    hi = p;
                }
                if (p < lo) {
                    lo = p;
                }
                local v: float = 1000.0 + Math.floor(rng.exponential(0.001));
                notional = notional + (p * v);
                vol_total = vol_total + v;
            }
            price = p;
            s.push(Bar { time: cast<long>(i) * interval, open: open, high: hi, low: lo, close: p, volume: vol_total, trades: cast<long>(steps), vwap: notional / vol_total });
        }
        return s;
    }
}

struct BarAggregator {
    mode: BarMode,
    threshold: long,
    series: BarSeries,
    current: Bar,
    active: bool,
    notional: float,
    filled: float,
    ticks: long,

    frame new(mode: BarMode, threshold: long) ret BarAggregator {
        local a: BarAggregator;
        a.mode = mode;
        a.threshold = threshold < 1 ? 1 : threshold;
        a.series = BarSeries.new(256, a.threshold);
        a.active = false;
        a.notional = 0.0;
        a.filled = 0.0;
        a.ticks = 0;
        return a;
    }

    frame destroy(this: *BarAggregator) {
        this.series.destroy();
    }

    frame begin(this: *BarAggregator, time: long, price: float) {
        local start: long = time;
        if (this.mode == BarMode.Time) {
            start = (time / this.threshold) * this.threshold;
        }
        this.current = Bar { time: start, open: price, high: price, low: price, close: price, volume: 0.0, trades: 0, vwap: price };
        this.active = true;
        this.notional = 0.0;
        this.filled = 0.0;
        this.ticks = 0;
    }

    frame finish(this: *BarAggregator) {
        if (!this.active) {
            return;
        }
        this.current.vwap = this.current.volume > 0.0 ? this.notional / this.current.volume : this.current.close;
        this.series.push(this.current);
        this.active = false;
    }

    frame add(this: *BarAggregator, time: long, price: float, size: float) {
        if (this.active && (this.mode == BarMode.Time)) {
            local bucket: long = (time / this.threshold) * this.threshold;
            if (bucket != this.current.time) {
                this.finish();
            }
        }
        if (!this.active) {
            this.begin(time, price);
        }
        if (price > this.current.high) {
            this.current.high = price;
        }
        if (price < this.current.low) {
            this.current.low = price;
        }
        this.current.close = price;
        this.current.volume = this.current.volume + size;
        this.current.trades = this.current.trades + 1;
        this.notional = this.notional + (price * size);
        this.ticks = this.ticks + 1;
        if ((this.mode == BarMode.Volume) && (this.current.volume >= cast<float>(this.threshold))) {
            this.finish();
        } else if ((this.mode == BarMode.Ticks) && (this.ticks >= this.threshold)) {
            this.finish();
        }
    }

    frame flush(this: *BarAggregator) {
        this.finish();
    }
}
