# An owned list of heap strings, and a growable character buffer.
#
# StrList copies every string it is given and frees them in destroy();
# take() hands one back to the caller and removes it from the list.

import malloc, free, memcpy from "std/c.bpl";
import [Text] from "./text.bpl";

export [StrList];
export [CharBuf];

struct StrList {
    items: *string,
    count: int,
    cap: int,

    frame new(capacity: int) ret StrList {
        local l: StrList;
        l.cap = capacity < 4 ? 4 : capacity;
        l.items = cast<*string>(malloc(cast<long>(l.cap) * sizeof(string)));
        l.count = 0;
        return l;
    }

    frame destroy(this: *StrList) {
        this.clear();
        if (this.items != nullptr) {
            free(cast<*void>(this.items));
            this.items = nullptr;
        }
    }

    frame clear(this: *StrList) {
        loop (local i: int = 0; i < this.count; i = i + 1) {
            Text.release(this.items[i]);
        }
        this.count = 0;
    }

    frame grow(this: *StrList) {
        local next: *string = cast<*string>(malloc(cast<long>(this.cap * 2) * sizeof(string)));
        loop (local i: int = 0; i < this.count; i = i + 1) {
            next[i] = this.items[i];
        }
        free(cast<*void>(this.items));
        this.items = next;
        this.cap = this.cap * 2;
    }

    # Stores a copy of s.
    frame push(this: *StrList, s: string) {
        this.adopt(Text.copy(s));
    }

    # Stores s itself; the list frees it later.
    frame adopt(this: *StrList, s: string) {
        if (this.count == this.cap) {
            this.grow();
        }
        this.items[this.count] = s;
        this.count = this.count + 1;
    }

    frame get(this: *StrList, i: int) ret string {
        if ((i < 0) || (i >= this.count)) {
            return nullptr;
        }
        return this.items[i];
    }

    # Removes item i and returns it; the caller owns the string.
    frame take(this: *StrList, i: int) ret string {
        local s: string = this.items[i];
        loop (local k: int = i + 1; k < this.count; k = k + 1) {
            this.items[k - 1] = this.items[k];
        }
        this.count = this.count - 1;
        return s;
    }

    frame indexOf(this: *StrList, s: string) ret int {
        loop (local i: int = 0; i < this.count; i = i + 1) {
            if (Text.equals(this.items[i], s)) {
                return i;
            }
        }
        return -1;
    }

    # Splits text on `sep`, skipping empty pieces when `skip_empty`.
    frame split(text: string, sep: char, skip_empty: bool) ret StrList {
        local l: StrList = StrList.new(8);
        if (text == nullptr) {
            return l;
        }
        local start: int = 0;
        local i: int = 0;
        loop {
            local c: char = text[i];
            if ((c == sep) || (c == cast<char>(0))) {
                local n: int = i - start;
                if ((n > 0) || !skip_empty) {
                    l.adopt(Text.copyN(cast<string>(cast<*char>(text) + start), n));
                }
                if (c == cast<char>(0)) {
                    break;
                }
                start = i + 1;
            }
            i = i + 1;
        }
        return l;
    }
}

struct CharBuf {
    data: *char,
    len: int,
    cap: int,

    frame new(capacity: int) ret CharBuf {
        local b: CharBuf;
        b.cap = capacity < 16 ? 16 : capacity;
        b.data = cast<*char>(malloc(cast<long>(b.cap)));
        b.len = 0;
        b.data[0] = cast<char>(0);
        return b;
    }

    frame destroy(this: *CharBuf) {
        if (this.data != nullptr) {
            free(cast<*void>(this.data));
            this.data = nullptr;
        }
        this.len = 0;
    }

    frame clear(this: *CharBuf) {
        this.len = 0;
        this.data[0] = cast<char>(0);
    }

    frame reserve(this: *CharBuf, extra: int) {
        if ((this.len + extra + 1) <= this.cap) {
            return;
        }
        local next: int = this.cap * 2;
        loop (next < (this.len + extra + 1)) {
            next = next * 2;
        }
        local grown: *char = cast<*char>(malloc(cast<long>(next)));
        memcpy(cast<*void>(grown), cast<*void>(this.data), cast<long>(this.len + 1));
        free(cast<*void>(this.data));
        this.data = grown;
        this.cap = next;
    }

    frame ch(this: *CharBuf, c: char) {
        this.reserve(1);
        this.data[this.len] = c;
        this.len = this.len + 1;
        this.data[this.len] = cast<char>(0);
    }

    frame str(this: *CharBuf, s: string) {
        if (s == nullptr) {
            return;
        }
        local n: int = Text.length(s);
        this.reserve(n);
        memcpy(cast<*void>(this.data + this.len), cast<*void>(s), cast<long>(n));
        this.len = this.len + n;
        this.data[this.len] = cast<char>(0);
    }

    frame strN(this: *CharBuf, s: *char, n: int) {
        if (n <= 0) {
            return;
        }
        this.reserve(n);
        memcpy(cast<*void>(this.data + this.len), cast<*void>(s), cast<long>(n));
        this.len = this.len + n;
        this.data[this.len] = cast<char>(0);
    }

    frame integer(this: *CharBuf, v: long) {
        if (v == 0) {
            this.ch('0');
            return;
        }
        local digits: char[24];
        local n: int = 0;
        local negative: bool = v < 0;
        local u: u64 = negative ? cast<u64>(0) - cast<u64>(v) : cast<u64>(v);
        loop (u > cast<u64>(0)) {
            digits[n] = cast<char>(48 + cast<int>(u % cast<u64>(10)));
            u = u / cast<u64>(10);
            n = n + 1;
        }
        if (negative) {
            this.ch('-');
        }
        loop (n > 0) {
            n = n - 1;
            this.ch(digits[n]);
        }
    }

    # Integer padded with leading zeros to `width` digits.
    frame padded(this: *CharBuf, v: long, width: int) {
        local digits: char[24];
        local n: int = 0;
        local u: long = v < 0 ? -v : v;
        loop ((u > 0) || (n == 0)) {
            digits[n] = cast<char>(48 + cast<int>(u % 10));
            u = u / 10;
            n = n + 1;
        }
        loop (local k: int = n; k < width; k = k + 1) {
            this.ch('0');
        }
        loop (n > 0) {
            n = n - 1;
            this.ch(digits[n]);
        }
    }

    # Fixed-point value `v / 10^scale`, trailing zeros trimmed (at least one
    # digit after the point is dropped entirely when the value is integral).
    frame decimal(this: *CharBuf, v: long, scale: int) {
        local unit: long = 1;
        loop (local i: int = 0; i < scale; i = i + 1) {
            unit = unit * 10;
        }
        if (v < 0) {
            this.ch('-');
            v = -v;
        }
        this.integer(v / unit);
        local frac: long = v % unit;
        if (frac == 0) {
            return;
        }
        local width: int = scale;
        loop ((frac % 10) == 0) {
            frac = frac / 10;
            width = width - 1;
        }
        this.ch('.');
        this.padded(frac, width);
    }

    # Heap copy of the contents.
    frame copy(this: *CharBuf) ret string {
        return Text.copyN(cast<string>(this.data), this.len);
    }

    frame text(this: *CharBuf) ret string {
        return cast<string>(this.data);
    }
}
