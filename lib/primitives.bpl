import [String] from "std/string.bpl";
import [Comparable] from "std/core_specs.bpl";
import ctpop, ctlz, cttz, bswap, bitreverse from "./intrinsics.bpl";
import memcpy, memmove, memset from "./intrinsics.bpl";

extern sprintf(str: string, format: string, ...) ret int;
extern snprintf(str: string, size: long, format: string, ...) ret int;
extern printf(format: string, ...) ret int;
extern malloc(size: long) ret string;
extern free(ptr: string) ret void;

struct Int: Comparable<Int> {
    value: int,
    frame toString(this: *Int) ret String {
        local buffer: char[32];
        local buf: string = cast<string>(&buffer[0]);
        local written: int = snprintf(buf, 32, "%d", this.value);
        if ((written < 0) || (written >= 32)) {
            throw "Primitive formatting failed";
        }
        return String.new(buf);
    }

    # Comparable implementation
    frame __eq__(this: *Int, other: *Int) ret bool {
        return this.value == other.value;
    }
    frame __ne__(this: *Int, other: *Int) ret bool {
        return this.value != other.value;
    }
    frame __lt__(this: *Int, other: *Int) ret bool {
        return this.value < other.value;
    }
    frame __gt__(this: *Int, other: *Int) ret bool {
        return this.value > other.value;
    }
    frame __le__(this: *Int, other: *Int) ret bool {
        return this.value <= other.value;
    }
    frame __ge__(this: *Int, other: *Int) ret bool {
        return this.value >= other.value;
    }

    # Bit Manipulation Intrinsics
    frame popCount(this: *Int) ret int {
        return ctpop(this.value);
    }
    frame leadingZeros(this: *Int) ret int {
        return ctlz(this.value);
    }
    frame trailingZeros(this: *Int) ret int {
        return cttz(this.value);
    }
    frame byteSwap(this: *Int) ret int {
        return bswap(this.value);
    }
    frame reverseBits(this: *Int) ret int {
        return bitreverse(this.value);
    }
}

struct Bool: Comparable<Bool> {
    value: bool,
    frame toString(this: *Bool) ret String {
        if (this.value) {
            return String.new("true");
        } else {
            return String.new("false");
        }
    }

    # Comparable implementation
    frame __eq__(this: *Bool, other: *Bool) ret bool {
        return this.value == other.value;
    }
    frame __ne__(this: *Bool, other: *Bool) ret bool {
        return this.value != other.value;
    }
    frame __lt__(this: *Bool, other: *Bool) ret bool {
        return cast<int>(this.value) < cast<int>(other.value);
    }
    frame __gt__(this: *Bool, other: *Bool) ret bool {
        return cast<int>(this.value) > cast<int>(other.value);
    }
    frame __le__(this: *Bool, other: *Bool) ret bool {
        return cast<int>(this.value) <= cast<int>(other.value);
    }
    frame __ge__(this: *Bool, other: *Bool) ret bool {
        return cast<int>(this.value) >= cast<int>(other.value);
    }
}

struct Double: Comparable<Double> {
    value: double,
    frame toString(this: *Double) ret String {
        local buffer: char[512];
        local buf: string = cast<string>(&buffer[0]);
        local written: int = snprintf(buf, 512, "%f", this.value);
        if ((written < 0) || (written >= 512)) {
            throw "Primitive formatting failed";
        }
        return String.new(buf);
    }

    # Comparable implementation
    frame __eq__(this: *Double, other: *Double) ret bool {
        return this.value == other.value;
    }
    frame __ne__(this: *Double, other: *Double) ret bool {
        return this.value != other.value;
    }
    frame __lt__(this: *Double, other: *Double) ret bool {
        return this.value < other.value;
    }
    frame __gt__(this: *Double, other: *Double) ret bool {
        return this.value > other.value;
    }
    frame __le__(this: *Double, other: *Double) ret bool {
        return this.value <= other.value;
    }
    frame __ge__(this: *Double, other: *Double) ret bool {
        return this.value >= other.value;
    }
}

struct Long: Comparable<Long> {
    value: long,
    frame toString(this: *Long) ret String {
        local buffer: char[32];
        local buf: string = cast<string>(&buffer[0]);
        local written: int = snprintf(buf, 32, "%lld", this.value);
        if ((written < 0) || (written >= 32)) {
            throw "Primitive formatting failed";
        }
        return String.new(buf);
    }

    # Comparable implementation
    frame __eq__(this: *Long, other: *Long) ret bool {
        return this.value == other.value;
    }
    frame __ne__(this: *Long, other: *Long) ret bool {
        return this.value != other.value;
    }
    frame __lt__(this: *Long, other: *Long) ret bool {
        return this.value < other.value;
    }
    frame __gt__(this: *Long, other: *Long) ret bool {
        return this.value > other.value;
    }
    frame __le__(this: *Long, other: *Long) ret bool {
        return this.value <= other.value;
    }
    frame __ge__(this: *Long, other: *Long) ret bool {
        return this.value >= other.value;
    }

    # Bit Manipulation Intrinsics
    frame popCount(this: *Long) ret long {
        return this.value.popCount();
    }
    frame leadingZeros(this: *Long) ret long {
        return this.value.leadingZeros();
    }
    frame trailingZeros(this: *Long) ret long {
        return this.value.trailingZeros();
    }
    frame byteSwap(this: *Long) ret long {
        return this.value.byteSwap();
    }
    frame reverseBits(this: *Long) ret long {
        return this.value.reverseBits();
    }
}

struct Char {
    value: char,
    frame toString(this: *Char) ret String {
        local buffer: char[8];
        local buf: string = cast<string>(&buffer[0]);
        local written: int = snprintf(buf, 8, "%c", cast<int>(this.value));
        if ((written < 0) || (written >= 8)) {
            throw "Primitive formatting failed";
        }
        return String.new(buf);
    }
}

struct UChar {
    value: uchar,
    frame toString(this: *UChar) ret String {
        local buffer: char[8];
        local buf: string = cast<string>(&buffer[0]);
        local written: int = snprintf(buf, 8, "%c", cast<uint>(this.value));
        if ((written < 0) || (written >= 8)) {
            throw "Primitive formatting failed";
        }
        return String.new(buf);
    }
}

struct Short {
    value: short,
    frame toString(this: *Short) ret String {
        local buffer: char[16];
        local buf: string = cast<string>(&buffer[0]);
        local written: int = snprintf(buf, 16, "%hd", cast<int>(this.value));
        if ((written < 0) || (written >= 16)) {
            throw "Primitive formatting failed";
        }
        return String.new(buf);
    }

    # Bit Manipulation Intrinsics
    frame popCount(this: *Short) ret uint {
        local bits: uint = cast<uint>(this.value) & cast<uint>(65535);
        return bits.popCount();
    }
    frame leadingZeros(this: *Short) ret uint {
        local bits: uint = cast<uint>(this.value) & cast<uint>(65535);
        return bits.leadingZeros() - cast<uint>(16);
    }
    frame trailingZeros(this: *Short) ret uint {
        local bits: uint = cast<uint>(this.value) & cast<uint>(65535);
        if (bits == cast<uint>(0)) { return cast<uint>(16); }
        return bits.trailingZeros();
    }
    frame byteSwap(this: *Short) ret uint {
        local bits: uint = cast<uint>(this.value) & cast<uint>(65535);
        return bits.byteSwap() >> cast<uint>(16);
    }
    frame reverseBits(this: *Short) ret uint {
        local bits: uint = cast<uint>(this.value) & cast<uint>(65535);
        return bits.reverseBits() >> cast<uint>(16);
    }
}

struct UShort {
    value: ushort,
    frame toString(this: *UShort) ret String {
        local buffer: char[16];
        local buf: string = cast<string>(&buffer[0]);
        local written: int = snprintf(buf, 16, "%d", cast<int>(this.value));
        if ((written < 0) || (written >= 16)) {
            throw "Primitive formatting failed";
        }
        return String.new(buf);
    }

    # Bit Manipulation Intrinsics
    frame popCount(this: *UShort) ret uint {
        local bits: uint = cast<uint>(this.value) & cast<uint>(65535);
        return bits.popCount();
    }
    frame leadingZeros(this: *UShort) ret uint {
        local bits: uint = cast<uint>(this.value) & cast<uint>(65535);
        return bits.leadingZeros() - cast<uint>(16);
    }
    frame trailingZeros(this: *UShort) ret uint {
        local bits: uint = cast<uint>(this.value) & cast<uint>(65535);
        if (bits == cast<uint>(0)) { return cast<uint>(16); }
        return bits.trailingZeros();
    }
    frame byteSwap(this: *UShort) ret uint {
        local bits: uint = cast<uint>(this.value) & cast<uint>(65535);
        return bits.byteSwap() >> cast<uint>(16);
    }
    frame reverseBits(this: *UShort) ret uint {
        local bits: uint = cast<uint>(this.value) & cast<uint>(65535);
        return bits.reverseBits() >> cast<uint>(16);
    }
}

struct UInt {
    value: uint,
    frame toString(this: *UInt) ret String {
        local buffer: char[16];
        local buf: string = cast<string>(&buffer[0]);
        local written: int = snprintf(buf, 16, "%u", this.value);
        if ((written < 0) || (written >= 16)) {
            throw "Primitive formatting failed";
        }
        return String.new(buf);
    }
    # Bit Manipulation Intrinsics
    frame popCount(this: *UInt) ret uint {
        return this.value.popCount();
    }
    frame leadingZeros(this: *UInt) ret uint {
        return this.value.leadingZeros();
    }
    frame trailingZeros(this: *UInt) ret uint {
        return this.value.trailingZeros();
    }
    frame byteSwap(this: *UInt) ret uint {
        return this.value.byteSwap();
    }
    frame reverseBits(this: *UInt) ret uint {
        return this.value.reverseBits();
    }
}

struct ULong {
    value: ulong,
    frame toString(this: *ULong) ret String {
        local buffer: char[32];
        local buf: string = cast<string>(&buffer[0]);
        local written: int = snprintf(buf, 32, "%llu", this.value);
        if ((written < 0) || (written >= 32)) {
            throw "Primitive formatting failed";
        }
        return String.new(buf);
    }
    # Bit Manipulation Intrinsics
    frame popCount(this: *ULong) ret ulong {
        return this.value.popCount();
    }
    frame leadingZeros(this: *ULong) ret ulong {
        return this.value.leadingZeros();
    }
    frame trailingZeros(this: *ULong) ret ulong {
        return this.value.trailingZeros();
    }
    frame byteSwap(this: *ULong) ret ulong {
        return this.value.byteSwap();
    }
    frame reverseBits(this: *ULong) ret ulong {
        return this.value.reverseBits();
    }
}

export [Int];
export [Bool];
export [Double];
export [Long];
export [Char];
export [UChar];
export [Short];
export [UShort];
export [UInt];
export [ULong];
