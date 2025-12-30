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
        local buf: string = malloc(32);
        sprintf(buf, "%d", this.value);
        local s: String = String.new(buf);
        free(buf);
        return s;
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
        local buf: string = malloc(64);
        sprintf(buf, "%f", this.value);
        local s: String = String.new(buf);
        free(buf);
        return s;
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
        local buf: string = malloc(32);
        sprintf(buf, "%lld", this.value);
        local s: String = String.new(buf);
        free(buf);
        return s;
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
        return 0;
    }
    frame leadingZeros(this: *Long) ret long {
        return 0;
    }
    frame trailingZeros(this: *Long) ret long {
        return 0;
    }
    frame byteSwap(this: *Long) ret long {
        return 0;
    }
    frame reverseBits(this: *Long) ret long {
        return 0;
    }
}

struct Char {
    value: char,
    frame toString(this: *Char) ret String {
        local buf: string = malloc(8);
        sprintf(buf, "%c", cast<int>(this.value));
        local s: String = String.new(buf);
        free(buf);
        return s;
    }
}

struct UChar {
    value: uchar,
    frame toString(this: *UChar) ret String {
        local buf: string = malloc(8);
        sprintf(buf, "%c", cast<uint>(this.value));
        local s: String = String.new(buf);
        free(buf);
        return s;
    }
}

struct Short {
    value: short,
    frame toString(this: *Short) ret String {
        local buf: string = malloc(16);
        sprintf(buf, "%hd", cast<int>(this.value));
        local s: String = String.new(buf);
        free(buf);
        return s;
    }

    # Bit Manipulation Intrinsics
    frame popCount(this: *Short) ret uint {
        return 0;
    }
    frame leadingZeros(this: *Short) ret uint {
        return 0;
    }
    frame trailingZeros(this: *Short) ret uint {
        return 0;
    }
    frame byteSwap(this: *Short) ret uint {
        return 0;
    }
    frame reverseBits(this: *Short) ret uint {
        return 0;
    }
}

struct UShort {
    value: ushort,
    frame toString(this: *UShort) ret String {
        local buf: string = malloc(16);
        sprintf(buf, "%d", cast<int>(this.value));
        local s: String = String.new(buf);
        free(buf);
        return s;
    }

    # Bit Manipulation Intrinsics
    frame popCount(this: *UShort) ret uint {
        return 0;
    }
    frame leadingZeros(this: *UShort) ret uint {
        return 0;
    }
    frame trailingZeros(this: *UShort) ret uint {
        return 0;
    }
    frame byteSwap(this: *UShort) ret uint {
        return 0;
    }
    frame reverseBits(this: *UShort) ret uint {
        return 0;
    }
}

struct UInt {
    value: uint,
    frame toString(this: *UInt) ret String {
        local buf: string = malloc(16);
        sprintf(buf, "%u", this.value);
        local s: String = String.new(buf);
        free(buf);
        return s;
    }
    # Bit Manipulation Intrinsics
    frame popCount(this: *UInt) ret uint {
        return 0;
    }
    frame leadingZeros(this: *UInt) ret uint {
        return 0;
    }
    frame trailingZeros(this: *UInt) ret uint {
        return 0;
    }
    frame byteSwap(this: *UInt) ret uint {
        return 0;
    }
    frame reverseBits(this: *UInt) ret uint {
        return 0;
    }
}

struct ULong {
    value: ulong,
    frame toString(this: *ULong) ret String {
        local buf: string = malloc(32);
        sprintf(buf, "%llu", this.value);
        local s: String = String.new(buf);
        free(buf);
        return s;
    }
    # Bit Manipulation Intrinsics
    frame popCount(this: *ULong) ret ulong {
        return 0;
    }
    frame leadingZeros(this: *ULong) ret ulong {
        return 0;
    }
    frame trailingZeros(this: *ULong) ret ulong {
        return 0;
    }
    frame byteSwap(this: *ULong) ret ulong {
        return 0;
    }
    frame reverseBits(this: *ULong) ret ulong {
        return 0;
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
