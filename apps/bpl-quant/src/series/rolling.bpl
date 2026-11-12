# Rolling-window statistics in O(1) amortized time per update.
#
# RollingWindow keeps a ring buffer with running sums for mean and variance,
# plus two monotonic deques for the window minimum and maximum. Medians use a
# sorted window with binary-search insertion (O(w) per update, fine for the
# window sizes indicators use).

import malloc, free, memmove from "std/c.bpl";
import [Math] from "std/math.bpl";

export [RollingWindow];
export [RollingMedian];
export [RollingCovariance];
export [Ewma];

struct RollingWindow {
    values: *float,
    size: int,
    count: int,
    head: int,
    sum: float,
    sum_sq: float,
    # Monotonic deques store absolute sample indices.
    min_q: *long,
    max_q: *long,
    min_head: int,
    min_tail: int,
    max_head: int,
    max_tail: int,
    seen: long,
    history: *float,

    frame new(size: int) ret RollingWindow {
        local w: RollingWindow;
        w.size = size < 1 ? 1 : size;
        w.values = cast<*float>(malloc(cast<long>(w.size) * sizeof(float)));
        w.history = cast<*float>(malloc(cast<long>(w.size) * sizeof(float)));
        w.min_q = cast<*long>(malloc(cast<long>(w.size + 1) * sizeof(long)));
        w.max_q = cast<*long>(malloc(cast<long>(w.size + 1) * sizeof(long)));
        w.reset();
        return w;
    }

    frame reset(this: *RollingWindow) {
        this.count = 0;
        this.head = 0;
        this.sum = 0.0;
        this.sum_sq = 0.0;
        this.min_head = 0;
        this.min_tail = 0;
        this.max_head = 0;
        this.max_tail = 0;
        this.seen = 0;
    }

    frame destroy(this: *RollingWindow) {
        if (this.values != nullptr) {
            free(cast<*void>(this.values));
            free(cast<*void>(this.history));
            free(cast<*void>(this.min_q));
            free(cast<*void>(this.max_q));
            this.values = nullptr;
        }
    }

    frame valueAt(this: *RollingWindow, index: long) ret float {
        return this.history[cast<int>(index % cast<long>(this.size))];
    }

    frame qcap(this: *RollingWindow) ret int {
        return this.size + 1;
    }

    frame push(this: *RollingWindow, x: float) {
        local qc: int = this.qcap();
        if (this.count == this.size) {
            local old: float = this.values[this.head];
            this.sum = this.sum - old;
            this.sum_sq = this.sum_sq - (old * old);
            this.values[this.head] = x;
            this.head = (this.head + 1) % this.size;
        } else {
            this.values[(this.head + this.count) % this.size] = x;
            this.count = this.count + 1;
        }
        this.sum = this.sum + x;
        this.sum_sq = this.sum_sq + (x * x);
        local idx: long = this.seen;
        this.history[cast<int>(idx % cast<long>(this.size))] = x;
        this.seen = this.seen + 1;
        local oldest: long = this.seen - cast<long>(this.count);
        # Evict indices that left the window, then keep deques monotonic.
        loop ((this.min_head != this.min_tail) && (this.min_q[this.min_head] < oldest)) {
            this.min_head = (this.min_head + 1) % qc;
        }
        loop ((this.max_head != this.max_tail) && (this.max_q[this.max_head] < oldest)) {
            this.max_head = (this.max_head + 1) % qc;
        }
        loop (this.min_head != this.min_tail) {
            local back: int = ((this.min_tail + qc) - 1) % qc;
            if (this.valueAt(this.min_q[back]) >= x) {
                this.min_tail = back;
            } else {
                break;
            }
        }
        this.min_q[this.min_tail] = idx;
        this.min_tail = (this.min_tail + 1) % qc;
        loop (this.max_head != this.max_tail) {
            local back: int = ((this.max_tail + qc) - 1) % qc;
            if (this.valueAt(this.max_q[back]) <= x) {
                this.max_tail = back;
            } else {
                break;
            }
        }
        this.max_q[this.max_tail] = idx;
        this.max_tail = (this.max_tail + 1) % qc;
    }

    frame full(this: *RollingWindow) ret bool {
        return this.count == this.size;
    }

    frame mean(this: *RollingWindow) ret float {
        if (this.count == 0) {
            return 0.0;
        }
        return this.sum / cast<float>(this.count);
    }

    frame variance(this: *RollingWindow) ret float {
        if (this.count < 2) {
            return 0.0;
        }
        local n: float = cast<float>(this.count);
        local v: float = (this.sum_sq - ((this.sum * this.sum) / n)) / (n - 1.0);
        return v > 0.0 ? v : 0.0;
    }

    frame stddev(this: *RollingWindow) ret float {
        return Math.sqrt(this.variance());
    }

    frame populationStddev(this: *RollingWindow) ret float {
        if (this.count < 1) {
            return 0.0;
        }
        local n: float = cast<float>(this.count);
        local v: float = (this.sum_sq / n) - ((this.sum / n) * (this.sum / n));
        return v > 0.0 ? Math.sqrt(v) : 0.0;
    }

    frame min(this: *RollingWindow) ret float {
        return this.valueAt(this.min_q[this.min_head]);
    }

    frame max(this: *RollingWindow) ret float {
        return this.valueAt(this.max_q[this.max_head]);
    }

    # Index (0 = oldest) of the max inside the current window.
    frame argmaxAge(this: *RollingWindow) ret int {
        return cast<int>(this.seen - 1 - this.max_q[this.max_head]);
    }

    frame argminAge(this: *RollingWindow) ret int {
        return cast<int>(this.seen - 1 - this.min_q[this.min_head]);
    }

    frame oldest(this: *RollingWindow) ret float {
        return this.values[this.head % this.size];
    }

    frame newest(this: *RollingWindow) ret float {
        return this.values[((this.head + this.count) - 1) % this.size];
    }

    # Recomputes the sums from the buffer to cancel accumulated rounding.
    frame resync(this: *RollingWindow) {
        local s: float = 0.0;
        local s2: float = 0.0;
        loop (local i: int = 0; i < this.count; i = i + 1) {
            local v: float = this.values[(this.head + i) % this.size];
            s = s + v;
            s2 = s2 + (v * v);
        }
        this.sum = s;
        this.sum_sq = s2;
    }
}

struct RollingMedian {
    ring: *float,
    sorted: *float,
    size: int,
    count: int,
    head: int,

    frame new(size: int) ret RollingMedian {
        local m: RollingMedian;
        m.size = size < 1 ? 1 : size;
        m.ring = cast<*float>(malloc(cast<long>(m.size) * sizeof(float)));
        m.sorted = cast<*float>(malloc(cast<long>(m.size) * sizeof(float)));
        m.count = 0;
        m.head = 0;
        return m;
    }

    frame destroy(this: *RollingMedian) {
        if (this.ring != nullptr) {
            free(cast<*void>(this.ring));
            free(cast<*void>(this.sorted));
            this.ring = nullptr;
        }
    }

    frame position(this: *RollingMedian, x: float) ret int {
        local lo: int = 0;
        local hi: int = this.count;
        loop (lo < hi) {
            local mid: int = (lo + hi) >> 1;
            if (this.sorted[mid] < x) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        return lo;
    }

    frame removeSorted(this: *RollingMedian, x: float) {
        local p: int = this.position(x);
        local moved: int = this.count - p - 1;
        if (moved > 0) {
            memmove(cast<*void>(this.sorted + p), cast<*void>(this.sorted + p + 1), cast<long>(moved) * sizeof(float));
        }
        this.count = this.count - 1;
    }

    frame insertSorted(this: *RollingMedian, x: float) {
        local p: int = this.position(x);
        local moved: int = this.count - p;
        if (moved > 0) {
            memmove(cast<*void>(this.sorted + p + 1), cast<*void>(this.sorted + p), cast<long>(moved) * sizeof(float));
        }
        this.sorted[p] = x;
        this.count = this.count + 1;
    }

    frame push(this: *RollingMedian, x: float) {
        if (this.count == this.size) {
            local old: float = this.ring[this.head];
            this.removeSorted(old);
            this.ring[this.head] = x;
            this.head = (this.head + 1) % this.size;
            this.insertSorted(x);
            return;
        }
        this.ring[(this.head + this.count) % this.size] = x;
        this.insertSorted(x);
    }

    frame median(this: *RollingMedian) ret float {
        if (this.count == 0) {
            return 0.0;
        }
        if ((this.count % 2) == 1) {
            return this.sorted[this.count / 2];
        }
        return 0.5 * (this.sorted[(this.count / 2) - 1] + this.sorted[this.count / 2]);
    }

    frame quantile(this: *RollingMedian, q: float) ret float {
        if (this.count == 0) {
            return 0.0;
        }
        local h: float = cast<float>(this.count - 1) * q;
        local lo: int = cast<int>(Math.floor(h));
        if (lo >= (this.count - 1)) {
            return this.sorted[this.count - 1];
        }
        local frac: float = h - cast<float>(lo);
        return this.sorted[lo] + (frac * (this.sorted[lo + 1] - this.sorted[lo]));
    }
}

struct RollingCovariance {
    xs: *float,
    ys: *float,
    size: int,
    count: int,
    head: int,
    sx: float,
    sy: float,
    sxy: float,
    sxx: float,
    syy: float,

    frame new(size: int) ret RollingCovariance {
        local r: RollingCovariance;
        r.size = size < 2 ? 2 : size;
        r.xs = cast<*float>(malloc(cast<long>(r.size) * sizeof(float)));
        r.ys = cast<*float>(malloc(cast<long>(r.size) * sizeof(float)));
        r.count = 0;
        r.head = 0;
        r.sx = 0.0;
        r.sy = 0.0;
        r.sxy = 0.0;
        r.sxx = 0.0;
        r.syy = 0.0;
        return r;
    }

    frame destroy(this: *RollingCovariance) {
        if (this.xs != nullptr) {
            free(cast<*void>(this.xs));
            free(cast<*void>(this.ys));
            this.xs = nullptr;
        }
    }

    frame push(this: *RollingCovariance, x: float, y: float) {
        if (this.count == this.size) {
            local ox: float = this.xs[this.head];
            local oy: float = this.ys[this.head];
            this.sx = this.sx - ox;
            this.sy = this.sy - oy;
            this.sxy = this.sxy - (ox * oy);
            this.sxx = this.sxx - (ox * ox);
            this.syy = this.syy - (oy * oy);
            this.xs[this.head] = x;
            this.ys[this.head] = y;
            this.head = (this.head + 1) % this.size;
        } else {
            local pos: int = (this.head + this.count) % this.size;
            this.xs[pos] = x;
            this.ys[pos] = y;
            this.count = this.count + 1;
        }
        this.sx = this.sx + x;
        this.sy = this.sy + y;
        this.sxy = this.sxy + (x * y);
        this.sxx = this.sxx + (x * x);
        this.syy = this.syy + (y * y);
    }

    frame covariance(this: *RollingCovariance) ret float {
        if (this.count < 2) {
            return 0.0;
        }
        local n: float = cast<float>(this.count);
        return (this.sxy - ((this.sx * this.sy) / n)) / (n - 1.0);
    }

    frame correlation(this: *RollingCovariance) ret float {
        if (this.count < 2) {
            return 0.0;
        }
        local n: float = cast<float>(this.count);
        local vx: float = this.sxx - ((this.sx * this.sx) / n);
        local vy: float = this.syy - ((this.sy * this.sy) / n);
        if ((vx <= 0.0) || (vy <= 0.0)) {
            return 0.0;
        }
        return (this.sxy - ((this.sx * this.sy) / n)) / Math.sqrt(vx * vy);
    }

    # Rolling OLS beta of y on x.
    frame beta(this: *RollingCovariance) ret float {
        if (this.count < 2) {
            return 0.0;
        }
        local n: float = cast<float>(this.count);
        local vx: float = this.sxx - ((this.sx * this.sx) / n);
        if (vx <= 0.0) {
            return 0.0;
        }
        return (this.sxy - ((this.sx * this.sy) / n)) / vx;
    }
}

struct Ewma {
    alpha: float,
    value: float,
    variance: float,
    initialized: bool,
    count: long,

    frame new(alpha: float) ret Ewma {
        return Ewma { alpha: alpha, value: 0.0, variance: 0.0, initialized: false, count: 0 };
    }

    frame fromSpan(span: int) ret Ewma {
        return Ewma.new(2.0 / (cast<float>(span) + 1.0));
    }

    frame fromHalfLife(half_life: float) ret Ewma {
        return Ewma.new(1.0 - Math.exp(-0.69314718055994530942 / half_life));
    }

    frame push(this: *Ewma, x: float) {
        this.count = this.count + 1;
        if (!this.initialized) {
            this.value = x;
            this.variance = 0.0;
            this.initialized = true;
            return;
        }
        local diff: float = x - this.value;
        local incr: float = this.alpha * diff;
        this.value = this.value + incr;
        this.variance = (1.0 - this.alpha) * (this.variance + (diff * incr));
    }

    frame stddev(this: *Ewma) ret float {
        return Math.sqrt(this.variance);
    }
}
