# Owned growable buffers of doubles and longs.
#
# Compute kernels work on raw `*float` buffers; FVec owns one and records its
# length. Methods never hand out ownership: copy() allocates a new buffer.

import malloc, free, memcpy, memset from "std/c.bpl";
import [Math] from "std/math.bpl";

export [FVec];
export [LVec];
export [IVec];

struct FVec {
    data: *float,
    len: int,
    cap: int,

    frame new(capacity: int) ret FVec {
        local c: int = capacity < 4 ? 4 : capacity;
        local v: FVec;
        v.data = cast<*float>(malloc(cast<long>(c) * sizeof(float)));
        if (v.data == nullptr) {
            throw "FVec allocation failed";
        }
        v.len = 0;
        v.cap = c;
        return v;
    }

    frame zeros(n: int) ret FVec {
        local v: FVec = FVec.new(n);
        memset(cast<*void>(v.data), 0, cast<long>(v.cap) * sizeof(float));
        v.len = n;
        return v;
    }

    frame filled(n: int, value: float) ret FVec {
        local v: FVec = FVec.new(n);
        loop (local i: int = 0; i < n; i = i + 1) {
            v.data[i] = value;
        }
        v.len = n;
        return v;
    }

    frame fromRaw(values: *float, n: int) ret FVec {
        local v: FVec = FVec.new(n);
        if (n > 0) {
            memcpy(cast<*void>(v.data), cast<*void>(values), cast<long>(n) * sizeof(float));
        }
        v.len = n;
        return v;
    }

    frame linspace(lo: float, hi: float, n: int) ret FVec {
        local v: FVec = FVec.zeros(n);
        if (n == 1) {
            v.data[0] = lo;
            return v;
        }
        local step: float = (hi - lo) / cast<float>(n - 1);
        loop (local i: int = 0; i < n; i = i + 1) {
            v.data[i] = lo + (step * cast<float>(i));
        }
        return v;
    }

    frame destroy(this: *FVec) {
        if (this.data != nullptr) {
            free(cast<*void>(this.data));
            this.data = nullptr;
        }
        this.len = 0;
        this.cap = 0;
    }

    frame reserve(this: *FVec, wanted: int) {
        if (wanted <= this.cap) {
            return;
        }
        local c: int = this.cap * 2;
        if (c < wanted) {
            c = wanted;
        }
        local next: *float = cast<*float>(malloc(cast<long>(c) * sizeof(float)));
        if (next == nullptr) {
            throw "FVec allocation failed";
        }
        if (this.len > 0) {
            memcpy(cast<*void>(next), cast<*void>(this.data), cast<long>(this.len) * sizeof(float));
        }
        free(cast<*void>(this.data));
        this.data = next;
        this.cap = c;
    }

    frame push(this: *FVec, value: float) {
        if (this.len == this.cap) {
            this.reserve(this.len + 1);
        }
        this.data[this.len] = value;
        this.len = this.len + 1;
    }

    frame pop(this: *FVec) ret float {
        if (this.len == 0) {
            throw "FVec.pop on empty vector";
        }
        this.len = this.len - 1;
        return this.data[this.len];
    }

    frame get(this: *FVec, i: int) ret float {
        if ((i < 0) || (i >= this.len)) {
            throw "FVec index out of range";
        }
        return this.data[i];
    }

    frame set(this: *FVec, i: int, value: float) {
        if ((i < 0) || (i >= this.len)) {
            throw "FVec index out of range";
        }
        this.data[i] = value;
    }

    frame last(this: *FVec) ret float {
        if (this.len == 0) {
            throw "FVec.last on empty vector";
        }
        return this.data[this.len - 1];
    }

    frame clear(this: *FVec) {
        this.len = 0;
    }

    frame copy(this: *FVec) ret FVec {
        return FVec.fromRaw(this.data, this.len);
    }

    frame slice(this: *FVec, start: int, count: int) ret FVec {
        local s: int = start < 0 ? 0 : start;
        local n: int = count;
        if ((s + n) > this.len) {
            n = this.len - s;
        }
        if (n < 0) {
            n = 0;
        }
        return FVec.fromRaw(this.data + s, n);
    }

    frame sum(this: *FVec) ret float {
        # Kahan summation keeps long price series accurate.
        local s: float = 0.0;
        local c: float = 0.0;
        loop (local i: int = 0; i < this.len; i = i + 1) {
            local y: float = this.data[i] - c;
            local t: float = s + y;
            c = (t - s) - y;
            s = t;
        }
        return s;
    }

    frame mean(this: *FVec) ret float {
        if (this.len == 0) {
            return 0.0;
        }
        return this.sum() / cast<float>(this.len);
    }

    frame min(this: *FVec) ret float {
        local m: float = this.data[0];
        loop (local i: int = 1; i < this.len; i = i + 1) {
            if (this.data[i] < m) {
                m = this.data[i];
            }
        }
        return m;
    }

    frame max(this: *FVec) ret float {
        local m: float = this.data[0];
        loop (local i: int = 1; i < this.len; i = i + 1) {
            if (this.data[i] > m) {
                m = this.data[i];
            }
        }
        return m;
    }

    frame dot(this: *FVec, other: *FVec) ret float {
        local n: int = this.len < other.len ? this.len : other.len;
        local s: float = 0.0;
        loop (local i: int = 0; i < n; i = i + 1) {
            s = s + (this.data[i] * other.data[i]);
        }
        return s;
    }

    frame norm(this: *FVec) ret float {
        return Math.sqrt(this.dot(this));
    }

    frame scale(this: *FVec, k: float) {
        loop (local i: int = 0; i < this.len; i = i + 1) {
            this.data[i] = this.data[i] * k;
        }
    }

    frame addScaled(this: *FVec, other: *FVec, k: float) {
        local n: int = this.len < other.len ? this.len : other.len;
        loop (local i: int = 0; i < n; i = i + 1) {
            this.data[i] = this.data[i] + (other.data[i] * k);
        }
    }

    frame fill(this: *FVec, value: float) {
        loop (local i: int = 0; i < this.len; i = i + 1) {
            this.data[i] = value;
        }
    }

    # Simple returns r[i] = p[i+1]/p[i] - 1.
    frame returns(this: *FVec) ret FVec {
        local out: FVec = FVec.new(this.len);
        loop (local i: int = 1; i < this.len; i = i + 1) {
            out.push((this.data[i] / this.data[i - 1]) - 1.0);
        }
        return out;
    }

    frame logReturns(this: *FVec) ret FVec {
        local out: FVec = FVec.new(this.len);
        loop (local i: int = 1; i < this.len; i = i + 1) {
            out.push(Math.log(this.data[i] / this.data[i - 1]));
        }
        return out;
    }

    frame cumsum(this: *FVec) ret FVec {
        local out: FVec = FVec.zeros(this.len);
        local s: float = 0.0;
        loop (local i: int = 0; i < this.len; i = i + 1) {
            s = s + this.data[i];
            out.data[i] = s;
        }
        return out;
    }

    frame reverse(this: *FVec) {
        local i: int = 0;
        local j: int = this.len - 1;
        loop (i < j) {
            local t: float = this.data[i];
            this.data[i] = this.data[j];
            this.data[j] = t;
            i = i + 1;
            j = j - 1;
        }
    }
}

struct LVec {
    data: *long,
    len: int,
    cap: int,

    frame new(capacity: int) ret LVec {
        local c: int = capacity < 4 ? 4 : capacity;
        local v: LVec;
        v.data = cast<*long>(malloc(cast<long>(c) * sizeof(long)));
        if (v.data == nullptr) {
            throw "LVec allocation failed";
        }
        v.len = 0;
        v.cap = c;
        return v;
    }

    frame destroy(this: *LVec) {
        if (this.data != nullptr) {
            free(cast<*void>(this.data));
            this.data = nullptr;
        }
        this.len = 0;
        this.cap = 0;
    }

    frame push(this: *LVec, value: long) {
        if (this.len == this.cap) {
            local c: int = this.cap * 2;
            local next: *long = cast<*long>(malloc(cast<long>(c) * sizeof(long)));
            if (next == nullptr) {
                throw "LVec allocation failed";
            }
            memcpy(cast<*void>(next), cast<*void>(this.data), cast<long>(this.len) * sizeof(long));
            free(cast<*void>(this.data));
            this.data = next;
            this.cap = c;
        }
        this.data[this.len] = value;
        this.len = this.len + 1;
    }

    frame get(this: *LVec, i: int) ret long {
        if ((i < 0) || (i >= this.len)) {
            throw "LVec index out of range";
        }
        return this.data[i];
    }

    frame clear(this: *LVec) {
        this.len = 0;
    }

    frame sum(this: *LVec) ret long {
        local s: long = 0;
        loop (local i: int = 0; i < this.len; i = i + 1) {
            s = s + this.data[i];
        }
        return s;
    }
}

struct IVec {
    data: *int,
    len: int,
    cap: int,

    frame new(capacity: int) ret IVec {
        local c: int = capacity < 4 ? 4 : capacity;
        local v: IVec;
        v.data = cast<*int>(malloc(cast<long>(c) * sizeof(int)));
        if (v.data == nullptr) {
            throw "IVec allocation failed";
        }
        v.len = 0;
        v.cap = c;
        return v;
    }

    frame range(n: int) ret IVec {
        local v: IVec = IVec.new(n);
        loop (local i: int = 0; i < n; i = i + 1) {
            v.data[i] = i;
        }
        v.len = n;
        return v;
    }

    frame destroy(this: *IVec) {
        if (this.data != nullptr) {
            free(cast<*void>(this.data));
            this.data = nullptr;
        }
        this.len = 0;
        this.cap = 0;
    }

    frame push(this: *IVec, value: int) {
        if (this.len == this.cap) {
            local c: int = this.cap * 2;
            local next: *int = cast<*int>(malloc(cast<long>(c) * sizeof(int)));
            if (next == nullptr) {
                throw "IVec allocation failed";
            }
            memcpy(cast<*void>(next), cast<*void>(this.data), cast<long>(this.len) * sizeof(int));
            free(cast<*void>(this.data));
            this.data = next;
            this.cap = c;
        }
        this.data[this.len] = value;
        this.len = this.len + 1;
    }

    frame get(this: *IVec, i: int) ret int {
        if ((i < 0) || (i >= this.len)) {
            throw "IVec index out of range";
        }
        return this.data[i];
    }

    frame clear(this: *IVec) {
        this.len = 0;
    }
}
