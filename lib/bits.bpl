# Bit manipulation helpers for 32- and 64-bit integers.
#
# Counting operations use the LLVM ctpop/ctlz/cttz intrinsics through the
# primitive methods (`popCount`, `leadingZeros`, `trailingZeros`). Rotations
# take any count; it is reduced modulo the width. Signed inputs are treated
# as their two's-complement bit pattern.

export [Bits];

extern malloc(size: long) ret *void;

struct Bits {
    frame popCount32(value: uint) ret int {
        return cast<int>(value.popCount());
    }

    frame popCount64(value: ulong) ret int {
        return cast<int>(value.popCount());
    }

    # Leading zero bits; 32 for zero.
    frame leadingZeros32(value: uint) ret int {
        return cast<int>(value.leadingZeros());
    }

    # Leading zero bits; 64 for zero.
    frame leadingZeros64(value: ulong) ret int {
        return cast<int>(value.leadingZeros());
    }

    # Trailing zero bits; 32 for zero.
    frame trailingZeros32(value: uint) ret int {
        return cast<int>(value.trailingZeros());
    }

    # Trailing zero bits; 64 for zero.
    frame trailingZeros64(value: ulong) ret int {
        return cast<int>(value.trailingZeros());
    }

    frame rotateLeft32(value: uint, count: int) ret uint {
        local shift: uint = cast<uint>(count & 31);
        if (shift == cast<uint>(0)) {
            return value;
        }
        return (value << shift) | (value >> (cast<uint>(32) - shift));
    }

    frame rotateRight32(value: uint, count: int) ret uint {
        return Bits.rotateLeft32(value, 32 - (count & 31));
    }

    frame rotateLeft64(value: ulong, count: int) ret ulong {
        local shift: ulong = cast<ulong>(count & 63);
        if (shift == cast<ulong>(0)) {
            return value;
        }
        return (value << shift) | (value >> (cast<ulong>(64) - shift));
    }

    frame rotateRight64(value: ulong, count: int) ret ulong {
        return Bits.rotateLeft64(value, 64 - (count & 63));
    }

    frame byteSwap32(value: uint) ret uint {
        return value.byteSwap();
    }

    frame byteSwap64(value: ulong) ret ulong {
        return value.byteSwap();
    }

    frame reverseBits32(value: uint) ret uint {
        return value.reverseBits();
    }

    frame reverseBits64(value: ulong) ret ulong {
        return value.reverseBits();
    }

    # 1 when an odd number of bits is set.
    frame parity32(value: uint) ret int {
        return Bits.popCount32(value) & 1;
    }

    frame parity64(value: ulong) ret int {
        return Bits.popCount64(value) & 1;
    }

    frame isPowerOfTwo64(value: ulong) ret bool {
        return (value != cast<ulong>(0)) && ((value & (value - cast<ulong>(1))) == cast<ulong>(0));
    }

    # The smallest power of two >= value (1 for 0). Throws above 2^63.
    frame nextPowerOfTwo64(value: ulong) ret ulong {
        if (value <= cast<ulong>(1)) {
            return 1;
        }
        local leading: int = Bits.leadingZeros64(value - cast<ulong>(1));
        if (leading == 0) {
            throw "Bits.nextPowerOfTwo64 overflow";
        }
        return cast<ulong>(1) << cast<ulong>(64 - leading);
    }

    # Index of the highest set bit (floor(log2(value))), or -1 for zero.
    frame highestBit32(value: uint) ret int {
        return 31 - Bits.leadingZeros32(value);
    }

    frame highestBit64(value: ulong) ret int {
        return 63 - Bits.leadingZeros64(value);
    }

    # Index of the lowest set bit, or -1 for zero.
    frame lowestBit32(value: uint) ret int {
        if (value == cast<uint>(0)) {
            return -1;
        }
        return Bits.trailingZeros32(value);
    }

    frame lowestBit64(value: ulong) ret int {
        if (value == cast<ulong>(0)) {
            return -1;
        }
        return Bits.trailingZeros64(value);
    }

    # The value with only its lowest set bit kept (0 for 0).
    frame isolateLowest64(value: ulong) ret ulong {
        return value & (cast<ulong>(0) - value);
    }

    # A mask of the low `width` bits (0..64).
    frame mask64(width: int) ret ulong {
        if (width <= 0) {
            return 0;
        }
        if (width >= 64) {
            return ~cast<ulong>(0);
        }
        return (cast<ulong>(1) << cast<ulong>(width)) - cast<ulong>(1);
    }

    # `width` bits of `value` starting at bit `offset`.
    frame extract64(value: ulong, offset: int, width: int) ret ulong {
        if ((offset < 0) || (offset >= 64) || (width <= 0)) {
            return 0;
        }
        return (value >> cast<ulong>(offset)) & Bits.mask64(width);
    }

    # `value` with `width` bits at `offset` replaced by the low bits of `field`.
    frame insert64(value: ulong, offset: int, width: int, field: ulong) ret ulong {
        if ((offset < 0) || (offset >= 64) || (width <= 0)) {
            return value;
        }
        local mask: ulong = Bits.mask64(width) << cast<ulong>(offset);
        return (value & ~mask) | ((field << cast<ulong>(offset)) & mask);
    }

    frame testBit64(value: ulong, index: int) ret bool {
        if ((index < 0) || (index >= 64)) {
            return false;
        }
        return ((value >> cast<ulong>(index)) & cast<ulong>(1)) != cast<ulong>(0);
    }

    frame setBit64(value: ulong, index: int) ret ulong {
        if ((index < 0) || (index >= 64)) {
            return value;
        }
        return value | (cast<ulong>(1) << cast<ulong>(index));
    }

    frame clearBit64(value: ulong, index: int) ret ulong {
        if ((index < 0) || (index >= 64)) {
            return value;
        }
        return value & ~(cast<ulong>(1) << cast<ulong>(index));
    }

    frame toggleBit64(value: ulong, index: int) ret ulong {
        if ((index < 0) || (index >= 64)) {
            return value;
        }
        return value ^ (cast<ulong>(1) << cast<ulong>(index));
    }

    # Sign-extends the low `width` bits of `value` (1..64).
    frame signExtend64(value: ulong, width: int) ret long {
        if ((width <= 0) || (width >= 64)) {
            return cast<long>(value);
        }
        local shift: ulong = cast<ulong>(64 - width);
        return cast<long>(value << shift) >> cast<long>(shift);
    }

    # Interleaves the low 32 bits of x and y (Morton / Z-order code).
    frame interleave(x: uint, y: uint) ret ulong {
        return Bits._spread(x) | (Bits._spread(y) << cast<ulong>(1));
    }

    frame _spread(value: uint) ret ulong {
        local v: ulong = cast<ulong>(value);
        v = (v | (v << cast<ulong>(16))) & cast<ulong>(0x0000FFFF0000FFFF);
        v = (v | (v << cast<ulong>(8))) & cast<ulong>(0x00FF00FF00FF00FF);
        v = (v | (v << cast<ulong>(4))) & cast<ulong>(0x0F0F0F0F0F0F0F0F);
        v = (v | (v << cast<ulong>(2))) & cast<ulong>(0x3333333333333333);
        v = (v | (v << cast<ulong>(1))) & cast<ulong>(0x5555555555555555);
        return v;
    }

    # Gray code of `value` and its inverse.
    frame toGray64(value: ulong) ret ulong {
        return value ^ (value >> cast<ulong>(1));
    }

    frame fromGray64(gray: ulong) ret ulong {
        local value: ulong = gray;
        local shift: ulong = 1;
        loop (shift < cast<ulong>(64)) {
            value = value ^ (value >> shift);
            shift = shift << cast<ulong>(1);
        }
        return value;
    }

    # The lowest `width` bits of `value` as '0'/'1' characters, most
    # significant first (1..64). The caller frees the result.
    frame toBinary64(value: ulong, width: int) ret string {
        if (width < 1) {
            width = 1;
        }
        if (width > 64) {
            width = 64;
        }
        local text: string = cast<string>(malloc(cast<long>(width + 1)));
        if (text == nullptr) {
            throw "Bits.toBinary64 allocation failed";
        }
        loop (local i: int = 0; i < width; i = i + 1) {
            if (Bits.testBit64(value, width - 1 - i)) {
                text[i] = '1';
            } else {
                text[i] = '0';
            }
        }
        text[width] = cast<char>(0);
        return text;
    }
}
