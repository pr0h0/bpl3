# Latency histogram with log-linear buckets (HdrHistogram-style).
#
# Values are microseconds. Each power-of-two range is split into 16 linear
# sub-buckets, so any recorded value is reported within 1/16 (6.25%) of its
# true value up to about 1.2 hours.

import [Math] from "std/math.bpl";
import malloc, free, memset from "std/c.bpl";

export [LatencyHistogram];

global const SUB_BUCKETS: int = 16;
global const MAGNITUDES: int = 32;

struct LatencyHistogram {
    counts: *long,
    total: long,
    sum: float,
    min: long,
    max: long,

    frame new() ret LatencyHistogram {
        local h: LatencyHistogram;
        local n: long = cast<long>(SUB_BUCKETS * MAGNITUDES);
        h.counts = cast<*long>(malloc(n * sizeof(long)));
        memset(cast<*void>(h.counts), 0, n * sizeof(long));
        h.total = 0;
        h.sum = 0.0;
        h.min = 0;
        h.max = 0;
        return h;
    }

    frame destroy(this: *LatencyHistogram) {
        if (this.counts != nullptr) {
            free(cast<*void>(this.counts));
            this.counts = nullptr;
        }
    }

    frame reset(this: *LatencyHistogram) {
        memset(cast<*void>(this.counts), 0, cast<long>(SUB_BUCKETS * MAGNITUDES) * sizeof(long));
        this.total = 0;
        this.sum = 0.0;
        this.min = 0;
        this.max = 0;
    }

    frame bucketOf(value: long) ret int {
        if (value < cast<long>(SUB_BUCKETS)) {
            return cast<int>(value < 0 ? 0 : value);
        }
        local mag: int = 0;
        local v: long = value;
        loop (v >= cast<long>(SUB_BUCKETS * 2)) {
            v = v >> 1;
            mag = mag + 1;
        }
        # v is now in [16, 32): sub-bucket v - 16 of magnitude mag + 1.
        local idx: int = ((mag + 1) * SUB_BUCKETS) + cast<int>(v - cast<long>(SUB_BUCKETS));
        local cap: int = (SUB_BUCKETS * MAGNITUDES) - 1;
        return idx > cap ? cap : idx;
    }

    # Upper bound of a bucket's value range.
    frame bucketValue(idx: int) ret long {
        if (idx < SUB_BUCKETS) {
            return cast<long>(idx);
        }
        local mag: int = (idx / SUB_BUCKETS) - 1;
        local sub: long = cast<long>((idx % SUB_BUCKETS) + SUB_BUCKETS);
        return ((sub + 1) << cast<long>(mag)) - 1;
    }

    frame record(this: *LatencyHistogram, value: long) {
        local idx: int = LatencyHistogram.bucketOf(value);
        this.counts[idx] = this.counts[idx] + 1;
        if ((this.total == 0) || (value < this.min)) {
            this.min = value;
        }
        if (value > this.max) {
            this.max = value;
        }
        this.total = this.total + 1;
        this.sum = this.sum + cast<float>(value);
    }

    frame merge(this: *LatencyHistogram, other: *LatencyHistogram) {
        loop (local i: int = 0; i < (SUB_BUCKETS * MAGNITUDES); i = i + 1) {
            this.counts[i] = this.counts[i] + other.counts[i];
        }
        if (other.total > 0) {
            if ((this.total == 0) || (other.min < this.min)) {
                this.min = other.min;
            }
            if (other.max > this.max) {
                this.max = other.max;
            }
        }
        this.total = this.total + other.total;
        this.sum = this.sum + other.sum;
    }

    frame percentile(this: *LatencyHistogram, p: float) ret long {
        if (this.total == 0) {
            return 0;
        }
        local rank: long = cast<long>(Math.ceil((p / 100.0) * cast<float>(this.total)));
        if (rank < 1) {
            rank = 1;
        }
        local seen: long = 0;
        loop (local i: int = 0; i < (SUB_BUCKETS * MAGNITUDES); i = i + 1) {
            seen = seen + this.counts[i];
            if (seen >= rank) {
                local v: long = LatencyHistogram.bucketValue(i);
                return v > this.max ? this.max : v;
            }
        }
        return this.max;
    }

    frame mean(this: *LatencyHistogram) ret float {
        if (this.total == 0) {
            return 0.0;
        }
        return this.sum / cast<float>(this.total);
    }
}
