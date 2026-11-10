# Binary wire primitives: a growable byte buffer, a bounds-checked reader,
# little/big-endian fixed-width integers, LEB128 varints, zigzag encoding,
# CRC-32 (IEEE) and Adler-32 checksums, and hex dumps.
#
# Every reader access checks the remaining length and records the first
# failure instead of reading past the end; callers test `ok()` once after
# decoding a whole message.

import malloc, free, memcpy from "std/c.bpl";

export [ByteBuf];
export [ByteReader];
export [Crc32];
export [Hex];

struct ByteBuf {
    data: *u8,
    len: int,
    cap: int,

    frame new(capacity: int) ret ByteBuf {
        local c: int = capacity < 16 ? 16 : capacity;
        local b: ByteBuf;
        b.data = cast<*u8>(malloc(cast<long>(c)));
        if (b.data == nullptr) {
            throw "ByteBuf allocation failed";
        }
        b.len = 0;
        b.cap = c;
        return b;
    }

    frame destroy(this: *ByteBuf) {
        if (this.data != nullptr) {
            free(cast<*void>(this.data));
            this.data = nullptr;
        }
        this.len = 0;
        this.cap = 0;
    }

    frame clear(this: *ByteBuf) {
        this.len = 0;
    }

    frame reserve(this: *ByteBuf, extra: int) {
        local wanted: int = this.len + extra;
        if (wanted <= this.cap) {
            return;
        }
        local next: int = this.cap * 2;
        if (next < wanted) {
            next = wanted;
        }
        local grown: *u8 = cast<*u8>(malloc(cast<long>(next)));
        if (grown == nullptr) {
            throw "ByteBuf growth failed";
        }
        if (this.len > 0) {
            memcpy(cast<*void>(grown), cast<*void>(this.data), cast<long>(this.len));
        }
        free(cast<*void>(this.data));
        this.data = grown;
        this.cap = next;
    }

    frame u8(this: *ByteBuf, v: int) {
        this.reserve(1);
        this.data[this.len] = cast<u8>(v & 255);
        this.len = this.len + 1;
    }

    frame u16le(this: *ByteBuf, v: int) {
        this.u8(v);
        this.u8(v >> 8);
    }

    frame u32le(this: *ByteBuf, v: long) {
        loop (local i: int = 0; i < 4; i = i + 1) {
            this.u8(cast<int>((v >> cast<long>(8 * i)) & 255));
        }
    }

    frame u64le(this: *ByteBuf, v: long) {
        local u: u64 = cast<u64>(v);
        loop (local i: int = 0; i < 8; i = i + 1) {
            this.u8(cast<int>((u >> cast<u64>(8 * i)) & cast<u64>(255)));
        }
    }

    frame u16be(this: *ByteBuf, v: int) {
        this.u8(v >> 8);
        this.u8(v);
    }

    frame u32be(this: *ByteBuf, v: long) {
        loop (local i: int = 3; i >= 0; i = i - 1) {
            this.u8(cast<int>((v >> cast<long>(8 * i)) & 255));
        }
    }

    # 48-bit big-endian (ITCH-style nanosecond timestamps).
    frame u48be(this: *ByteBuf, v: long) {
        loop (local i: int = 5; i >= 0; i = i - 1) {
            this.u8(cast<int>((v >> cast<long>(8 * i)) & 255));
        }
    }

    frame u64be(this: *ByteBuf, v: long) {
        local u: u64 = cast<u64>(v);
        loop (local i: int = 7; i >= 0; i = i - 1) {
            this.u8(cast<int>((u >> cast<u64>(8 * i)) & cast<u64>(255)));
        }
    }

    frame f64le(this: *ByteBuf, v: float) {
        local bits: long = 0;
        memcpy(cast<*void>(&bits), cast<*void>(&v), 8);
        this.u64le(bits);
    }

    # Unsigned LEB128.
    frame varint(this: *ByteBuf, v: long) {
        local u: u64 = cast<u64>(v);
        loop {
            local low: int = cast<int>(u & cast<u64>(127));
            u = u >> cast<u64>(7);
            if (u == cast<u64>(0)) {
                this.u8(low);
                return;
            }
            this.u8(low | 128);
        }
    }

    # Signed values zigzag-encoded so small negatives stay short.
    frame svarint(this: *ByteBuf, v: long) {
        local z: u64 = (cast<u64>(v) << cast<u64>(1)) ^ cast<u64>(v >> 63);
        this.varint(cast<long>(z));
    }

    frame bytes(this: *ByteBuf, src: *u8, n: int) {
        if (n <= 0) {
            return;
        }
        this.reserve(n);
        memcpy(cast<*void>(this.data + this.len), cast<*void>(src), cast<long>(n));
        this.len = this.len + n;
    }

    # Fixed-width ASCII field, space padded (or truncated) to `width` bytes.
    frame alpha(this: *ByteBuf, s: string, width: int) {
        local i: int = 0;
        loop ((i < width) && (s != nullptr) && (s[i] != cast<char>(0))) {
            this.u8(cast<int>(cast<uchar>(s[i])));
            i = i + 1;
        }
        loop (i < width) {
            this.u8(32);
            i = i + 1;
        }
    }

    # Length-prefixed (varint) string.
    frame lstr(this: *ByteBuf, s: string) {
        local n: int = 0;
        if (s != nullptr) {
            loop (s[n] != cast<char>(0)) {
                n = n + 1;
            }
        }
        this.varint(cast<long>(n));
        this.bytes(cast<*u8>(s), n);
    }

    frame patchU16le(this: *ByteBuf, at: int, v: int) {
        this.data[at] = cast<u8>(v & 255);
        this.data[at + 1] = cast<u8>((v >> 8) & 255);
    }

    frame patchU32le(this: *ByteBuf, at: int, v: long) {
        loop (local i: int = 0; i < 4; i = i + 1) {
            this.data[at + i] = cast<u8>((v >> cast<long>(8 * i)) & 255);
        }
    }

    frame patchU16be(this: *ByteBuf, at: int, v: int) {
        this.data[at] = cast<u8>((v >> 8) & 255);
        this.data[at + 1] = cast<u8>(v & 255);
    }

    frame at(this: *ByteBuf, i: int) ret int {
        return cast<int>(this.data[i]);
    }
}

struct ByteReader {
    data: *u8,
    len: int,
    pos: int,
    failed: bool,
    error: string,

    frame over(data: *u8, len: int) ret ByteReader {
        return ByteReader { data: data, len: len, pos: 0, failed: false, error: nullptr };
    }

    frame ok(this: *ByteReader) ret bool {
        return !this.failed;
    }

    frame remaining(this: *ByteReader) ret int {
        return this.len - this.pos;
    }

    frame fail(this: *ByteReader, message: string) {
        if (!this.failed) {
            this.failed = true;
            this.error = message;
        }
    }

    frame need(this: *ByteReader, n: int) ret bool {
        if (this.failed) {
            return false;
        }
        if ((n < 0) || ((this.len - this.pos) < n)) {
            this.fail("truncated");
            return false;
        }
        return true;
    }

    frame u8(this: *ByteReader) ret int {
        if (!this.need(1)) {
            return 0;
        }
        local v: int = cast<int>(this.data[this.pos]);
        this.pos = this.pos + 1;
        return v;
    }

    frame peekU8(this: *ByteReader) ret int {
        if (this.failed || (this.pos >= this.len)) {
            return -1;
        }
        return cast<int>(this.data[this.pos]);
    }

    frame u16le(this: *ByteReader) ret int {
        if (!this.need(2)) {
            return 0;
        }
        local v: int = cast<int>(this.data[this.pos]) | (cast<int>(this.data[this.pos + 1]) << 8);
        this.pos = this.pos + 2;
        return v;
    }

    frame u32le(this: *ByteReader) ret long {
        if (!this.need(4)) {
            return 0;
        }
        local v: long = 0;
        loop (local i: int = 3; i >= 0; i = i - 1) {
            v = (v << 8) | cast<long>(this.data[this.pos + i]);
        }
        this.pos = this.pos + 4;
        return v;
    }

    frame u64le(this: *ByteReader) ret long {
        if (!this.need(8)) {
            return 0;
        }
        local v: u64 = cast<u64>(0);
        loop (local i: int = 7; i >= 0; i = i - 1) {
            v = (v << cast<u64>(8)) | cast<u64>(this.data[this.pos + i]);
        }
        this.pos = this.pos + 8;
        return cast<long>(v);
    }

    frame u16be(this: *ByteReader) ret int {
        if (!this.need(2)) {
            return 0;
        }
        local v: int = (cast<int>(this.data[this.pos]) << 8) | cast<int>(this.data[this.pos + 1]);
        this.pos = this.pos + 2;
        return v;
    }

    frame beN(this: *ByteReader, n: int) ret long {
        if (!this.need(n)) {
            return 0;
        }
        local v: u64 = cast<u64>(0);
        loop (local i: int = 0; i < n; i = i + 1) {
            v = (v << cast<u64>(8)) | cast<u64>(this.data[this.pos + i]);
        }
        this.pos = this.pos + n;
        return cast<long>(v);
    }

    frame u32be(this: *ByteReader) ret long {
        return this.beN(4);
    }

    frame u48be(this: *ByteReader) ret long {
        return this.beN(6);
    }

    frame u64be(this: *ByteReader) ret long {
        return this.beN(8);
    }

    frame f64le(this: *ByteReader) ret float {
        local bits: long = this.u64le();
        local v: float = 0.0;
        memcpy(cast<*void>(&v), cast<*void>(&bits), 8);
        return v;
    }

    frame varint(this: *ByteReader) ret long {
        local result: u64 = cast<u64>(0);
        local shift: int = 0;
        loop {
            if (shift > 63) {
                this.fail("varint too long");
                return 0;
            }
            local b: int = this.u8();
            if (this.failed) {
                return 0;
            }
            result = result | (cast<u64>(b & 127) << cast<u64>(shift));
            if ((b & 128) == 0) {
                return cast<long>(result);
            }
            shift = shift + 7;
        }
        return 0;
    }

    frame svarint(this: *ByteReader) ret long {
        local z: u64 = cast<u64>(this.varint());
        local magnitude: long = cast<long>(z >> cast<u64>(1));
        if ((z & cast<u64>(1)) != cast<u64>(0)) {
            return -magnitude - 1;
        }
        return magnitude;
    }

    frame skip(this: *ByteReader, n: int) {
        if (this.need(n)) {
            this.pos = this.pos + n;
        }
    }

    # Copies a fixed-width ASCII field into `out` (cap bytes incl. NUL),
    # trimming trailing spaces.
    frame alpha(this: *ByteReader, width: int, out: *char, cap: int) {
        if (!this.need(width)) {
            out[0] = cast<char>(0);
            return;
        }
        local n: int = width < (cap - 1) ? width : cap - 1;
        loop (local i: int = 0; i < n; i = i + 1) {
            out[i] = cast<char>(this.data[this.pos + i]);
        }
        loop ((n > 0) && (out[n - 1] == ' ')) {
            n = n - 1;
        }
        out[n] = cast<char>(0);
        this.pos = this.pos + width;
    }

    # Reads a varint-prefixed string into a fresh heap copy.
    frame lstr(this: *ByteReader, max_len: int) ret string {
        local n: long = this.varint();
        if (this.failed) {
            return nullptr;
        }
        if ((n < 0) || (n > cast<long>(max_len))) {
            this.fail("string too long");
            return nullptr;
        }
        local k: int = cast<int>(n);
        if (!this.need(k)) {
            return nullptr;
        }
        local s: *char = cast<*char>(malloc(cast<long>(k + 1)));
        loop (local i: int = 0; i < k; i = i + 1) {
            s[i] = cast<char>(this.data[this.pos + i]);
        }
        s[k] = cast<char>(0);
        this.pos = this.pos + k;
        return cast<string>(s);
    }
}

global crc_table: u32[256];
global crc_ready: bool = false;

struct Crc32 {
    frame prepare() {
        if (crc_ready) {
            return;
        }
        loop (local n: int = 0; n < 256; n = n + 1) {
            local c: u32 = cast<u32>(n);
            loop (local k: int = 0; k < 8; k = k + 1) {
                if ((c & cast<u32>(1)) != cast<u32>(0)) {
                    c = cast<u32>(0xEDB88320) ^ (c >> cast<u32>(1));
                } else {
                    c = c >> cast<u32>(1);
                }
            }
            crc_table[n] = c;
        }
        crc_ready = true;
    }

    # Incremental update: start with 0, feed chunks, the result is the CRC.
    frame update(crc: long, data: *u8, n: int) ret long {
        Crc32.prepare();
        local c: u32 = cast<u32>(crc) ^ cast<u32>(0xFFFFFFFF);
        loop (local i: int = 0; i < n; i = i + 1) {
            local idx: int = cast<int>((c ^ cast<u32>(data[i])) & cast<u32>(255));
            c = crc_table[idx] ^ (c >> cast<u32>(8));
        }
        return cast<long>(c ^ cast<u32>(0xFFFFFFFF));
    }

    frame of(data: *u8, n: int) ret long {
        return Crc32.update(0, data, n);
    }

    frame ofText(s: string) ret long {
        local n: int = 0;
        loop (s[n] != cast<char>(0)) {
            n = n + 1;
        }
        return Crc32.of(cast<*u8>(s), n);
    }

    frame adler32(data: *u8, n: int) ret long {
        local a: long = 1;
        local b: long = 0;
        loop (local i: int = 0; i < n; i = i + 1) {
            a = (a + cast<long>(data[i])) % 65521;
            b = (b + a) % 65521;
        }
        return (b << 16) | a;
    }
}

struct Hex {
    frame digit(v: int) ret char {
        if (v < 10) {
            return cast<char>(48 + v);
        }
        return cast<char>(87 + v);
    }

    # Lower-case hex of n bytes into a fresh heap string.
    frame encode(data: *u8, n: int) ret string {
        local out: *char = cast<*char>(malloc(cast<long>((n * 2) + 1)));
        loop (local i: int = 0; i < n; i = i + 1) {
            local b: int = cast<int>(data[i]);
            out[2 * i] = Hex.digit(b >> 4);
            out[(2 * i) + 1] = Hex.digit(b & 15);
        }
        out[n * 2] = cast<char>(0);
        return cast<string>(out);
    }

    frame value(c: char) ret int {
        if ((c >= '0') && (c <= '9')) {
            return cast<int>(c) - 48;
        }
        if ((c >= 'a') && (c <= 'f')) {
            return cast<int>(c) - 87;
        }
        if ((c >= 'A') && (c <= 'F')) {
            return cast<int>(c) - 55;
        }
        return -1;
    }

    # Decodes hex text into `out`; returns bytes written or -1 on bad input.
    frame decode(s: string, out: *ByteBuf) ret int {
        local n: int = 0;
        loop (s[n] != cast<char>(0)) {
            n = n + 1;
        }
        if ((n % 2) != 0) {
            return -1;
        }
        loop (local i: int = 0; i < n; i = i + 2) {
            local hi: int = Hex.value(s[i]);
            local lo: int = Hex.value(s[i + 1]);
            if ((hi < 0) || (lo < 0)) {
                return -1;
            }
            out.u8((hi << 4) | lo);
        }
        return n / 2;
    }
}
