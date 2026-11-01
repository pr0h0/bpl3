# Arbitrary-precision signed integers

export [BigInt];

extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;
extern sprintf(buffer: string, format: string, ...) ret int;

# Limbs hold base-10^9 digits, least significant first.
global BIGINT_BASE: ulong = 1000000000;

# A signed integer of any size. Every operation returns a new BigInt that the
# caller owns and must `destroy`; the operands are never changed. A BigInt
# copied with `=` shares its limbs, so destroy only one of the copies, or use
# `clone` for an independent value.
struct BigInt {
    # -1, 0 or 1; 0 exactly when the value is zero.
    sign: int,
    length: int,
    limbs: *uint,

    # A zero with room for `capacity` limbs.
    frame withCapacity(capacity: int) ret BigInt {
        local value: BigInt;
        value.sign = 0;
        value.length = 0;
        local room: int = capacity;
        if (room < 1) {
            room = 1;
        }
        value.limbs = cast<*uint>(malloc(cast<long>(room) * 4));
        if (value.limbs == nullptr) {
            throw "BigInt: out of memory";
        }
        return value;
    }

    frame fromLong(number: long) ret BigInt {
        local value: BigInt = BigInt.withCapacity(3);
        local magnitude: ulong = cast<ulong>(number);
        if (number < 0) {
            # Two's complement negation also works for the minimum long.
            magnitude = cast<ulong>(0) - magnitude;
            value.sign = -1;
        } else if (number > 0) {
            value.sign = 1;
        }
        loop (magnitude > cast<ulong>(0)) {
            *(value.limbs + value.length) = cast<uint>(magnitude % BIGINT_BASE);
            value.length = value.length + 1;
            magnitude = magnitude / BIGINT_BASE;
        }
        return value;
    }

    # Parse an optionally signed decimal string. Throws on any other character
    # or an empty number.
    frame parse(text: string) ret BigInt {
        local start: int = 0;
        local negative: bool = false;
        if ((text[0] == '-') || (text[0] == '+')) {
            negative = text[0] == '-';
            start = 1;
        }
        local end: int = start;
        loop (text[end] != cast<char>(0)) {
            if ((text[end] < '0') || (text[end] > '9')) {
                throw "BigInt.parse: not a decimal integer";
            }
            end = end + 1;
        }
        if (end == start) {
            throw "BigInt.parse: no digits";
        }
        local value: BigInt = BigInt.withCapacity(((end - start) / 9) + 1);
        # Take nine digits at a time from the right.
        local chunkEnd: int = end;
        loop (chunkEnd > start) {
            local chunkStart: int = chunkEnd - 9;
            if (chunkStart < start) {
                chunkStart = start;
            }
            local limb: uint = 0;
            loop (local i: int = chunkStart; i < chunkEnd; i = i + 1) {
                limb = (limb * cast<uint>(10)) + (cast<uint>(text[i]) - cast<uint>(48));
            }
            *(value.limbs + value.length) = limb;
            value.length = value.length + 1;
            chunkEnd = chunkStart;
        }
        value.normalize();
        if (negative && (value.sign != 0)) {
            value.sign = -1;
        }
        return value;
    }

    # Drop leading zero limbs and make a zero value's sign 0.
    frame normalize(this: *BigInt) {
        loop ((this.length > 0) && (*(this.limbs + (this.length - 1)) == cast<uint>(0))) {
            this.length = this.length - 1;
        }
        if (this.length == 0) {
            this.sign = 0;
        } else if (this.sign == 0) {
            this.sign = 1;
        }
    }

    frame destroy(this: *BigInt) {
        free(cast<*void>(this.limbs));
        this.limbs = nullptr;
        this.length = 0;
        this.sign = 0;
    }

    frame clone(this: *BigInt) ret BigInt {
        local copy: BigInt = BigInt.withCapacity(this.length);
        loop (local i: int = 0; i < this.length; i = i + 1) {
            *(copy.limbs + i) = *(this.limbs + i);
        }
        copy.length = this.length;
        copy.sign = this.sign;
        return copy;
    }

    frame isZero(this: *BigInt) ret bool {
        return this.sign == 0;
    }

    frame isNegative(this: *BigInt) ret bool {
        return this.sign < 0;
    }

    # -1, 0 or 1 as the magnitude of `a` is below, equal to or above `b`'s.
    frame compareMagnitude(a: *BigInt, b: *BigInt) ret int {
        if (a.length != b.length) {
            if (a.length < b.length) {
                return -1;
            }
            return 1;
        }
        local i: int = a.length - 1;
        loop (i >= 0) {
            local left: uint = *(a.limbs + i);
            local right: uint = *(b.limbs + i);
            if (left != right) {
                if (left < right) {
                    return -1;
                }
                return 1;
            }
            i = i - 1;
        }
        return 0;
    }

    # -1, 0 or 1 as this value is below, equal to or above `other`.
    frame compare(this: *BigInt, other: *BigInt) ret int {
        if (this.sign != other.sign) {
            if (this.sign < other.sign) {
                return -1;
            }
            return 1;
        }
        local magnitude: int = BigInt.compareMagnitude(this, other);
        if (this.sign < 0) {
            return -magnitude;
        }
        return magnitude;
    }

    frame equals(this: *BigInt, other: *BigInt) ret bool {
        return this.compare(other) == 0;
    }

    # |a| + |b| with the given sign.
    frame addMagnitudes(a: *BigInt, b: *BigInt, sign: int) ret BigInt {
        local longer: int = a.length;
        if (b.length > longer) {
            longer = b.length;
        }
        local result: BigInt = BigInt.withCapacity(longer + 1);
        local carry: ulong = 0;
        loop (local i: int = 0; i < longer; i = i + 1) {
            local sum: ulong = carry;
            if (i < a.length) {
                sum = sum + cast<ulong>(*(a.limbs + i));
            }
            if (i < b.length) {
                sum = sum + cast<ulong>(*(b.limbs + i));
            }
            *(result.limbs + i) = cast<uint>(sum % BIGINT_BASE);
            carry = sum / BIGINT_BASE;
        }
        result.length = longer;
        if (carry > cast<ulong>(0)) {
            *(result.limbs + longer) = cast<uint>(carry);
            result.length = longer + 1;
        }
        result.sign = sign;
        result.normalize();
        return result;
    }

    # |a| - |b|, which must not be negative, with the given sign.
    frame subtractMagnitudes(a: *BigInt, b: *BigInt, sign: int) ret BigInt {
        local result: BigInt = BigInt.withCapacity(a.length);
        local borrow: long = 0;
        loop (local i: int = 0; i < a.length; i = i + 1) {
            local difference: long = cast<long>(*(a.limbs + i)) - borrow;
            if (i < b.length) {
                difference = difference - cast<long>(*(b.limbs + i));
            }
            borrow = 0;
            if (difference < 0) {
                difference = difference + cast<long>(BIGINT_BASE);
                borrow = 1;
            }
            *(result.limbs + i) = cast<uint>(difference);
        }
        result.length = a.length;
        result.sign = sign;
        result.normalize();
        return result;
    }

    # a + b, or a - b when `negateOther` is set.
    frame addSigned(a: *BigInt, b: *BigInt, negateOther: bool) ret BigInt {
        local otherSign: int = b.sign;
        if (negateOther) {
            otherSign = -otherSign;
        }
        if (b.sign == 0) {
            return a.clone();
        }
        if (a.sign == 0) {
            local copy: BigInt = b.clone();
            copy.sign = otherSign;
            return copy;
        }
        if (a.sign == otherSign) {
            return BigInt.addMagnitudes(a, b, a.sign);
        }
        local order: int = BigInt.compareMagnitude(a, b);
        if (order == 0) {
            return BigInt.withCapacity(1);
        }
        if (order > 0) {
            return BigInt.subtractMagnitudes(a, b, a.sign);
        }
        return BigInt.subtractMagnitudes(b, a, otherSign);
    }

    frame add(this: *BigInt, other: *BigInt) ret BigInt {
        return BigInt.addSigned(this, other, false);
    }

    frame subtract(this: *BigInt, other: *BigInt) ret BigInt {
        return BigInt.addSigned(this, other, true);
    }

    frame negate(this: *BigInt) ret BigInt {
        local copy: BigInt = this.clone();
        copy.sign = -copy.sign;
        return copy;
    }

    frame multiply(this: *BigInt, other: *BigInt) ret BigInt {
        if ((this.sign == 0) || (other.sign == 0)) {
            return BigInt.withCapacity(1);
        }
        local size: int = this.length + other.length;
        local result: BigInt = BigInt.withCapacity(size);
        loop (local k: int = 0; k < size; k = k + 1) {
            *(result.limbs + k) = 0;
        }
        loop (local i: int = 0; i < this.length; i = i + 1) {
            local carry: ulong = 0;
            local left: ulong = cast<ulong>(*(this.limbs + i));
            loop (local j: int = 0; j < other.length; j = j + 1) {
                # Below 10^18 + 2 * 10^9, well within a ulong.
                local current: ulong = cast<ulong>(*(result.limbs + (i + j))) + (left * cast<ulong>(*(other.limbs + j))) + carry;
                *(result.limbs + (i + j)) = cast<uint>(current % BIGINT_BASE);
                carry = current / BIGINT_BASE;
            }
            local position: int = i + other.length;
            loop (carry > cast<ulong>(0)) {
                local current: ulong = cast<ulong>(*(result.limbs + position)) + carry;
                *(result.limbs + position) = cast<uint>(current % BIGINT_BASE);
                carry = current / BIGINT_BASE;
                position = position + 1;
            }
        }
        result.length = size;
        result.sign = this.sign * other.sign;
        result.normalize();
        return result;
    }

    # This value divided by `divisor`, truncated toward zero; the remainder,
    # with this value's sign, goes to `remainder` when it is not null. Throws
    # if `divisor` is 0.
    frame divideSmall(this: *BigInt, divisor: int, remainder: *int) ret BigInt {
        if (divisor == 0) {
            throw "BigInt.divideSmall: division by zero";
        }
        local magnitude: long = cast<long>(divisor);
        if (magnitude < 0) {
            magnitude = -magnitude;
        }
        local result: BigInt = BigInt.withCapacity(this.length);
        local rest: long = 0;
        local i: int = this.length - 1;
        loop (i >= 0) {
            # Below 2^31 * 10^9, well within a long.
            local current: long = (rest * cast<long>(BIGINT_BASE)) + cast<long>(*(this.limbs + i));
            *(result.limbs + i) = cast<uint>(current / magnitude);
            rest = current % magnitude;
            i = i - 1;
        }
        result.length = this.length;
        result.sign = this.sign;
        if (divisor < 0) {
            result.sign = -result.sign;
        }
        result.normalize();
        if (remainder != nullptr) {
            *remainder = cast<int>(rest) * this.sign;
        }
        return result;
    }

    # |value| * factor for 0 <= factor < 10^9, as a non-negative BigInt.
    frame multiplyMagnitudeSmall(value: *BigInt, factor: ulong) ret BigInt {
        local result: BigInt = BigInt.withCapacity(value.length + 1);
        local carry: ulong = 0;
        loop (local i: int = 0; i < value.length; i = i + 1) {
            local current: ulong = (cast<ulong>(*(value.limbs + i)) * factor) + carry;
            *(result.limbs + i) = cast<uint>(current % BIGINT_BASE);
            carry = current / BIGINT_BASE;
        }
        result.length = value.length;
        if (carry > cast<ulong>(0)) {
            *(result.limbs + value.length) = cast<uint>(carry);
            result.length = value.length + 1;
        }
        result.sign = 1;
        result.normalize();
        return result;
    }

    # This value divided by `divisor`, truncated toward zero. When `remainder`
    # is not null it receives the remainder (with this value's sign), which
    # the caller must destroy. Throws if `divisor` is zero.
    frame divide(this: *BigInt, divisor: *BigInt, remainder: *BigInt) ret BigInt {
        if (divisor.sign == 0) {
            throw "BigInt.divide: division by zero";
        }
        local quotient: BigInt = BigInt.withCapacity(this.length);
        local rest: BigInt = BigInt.withCapacity(this.length + 1);
        # Schoolbook long division over base-10^9 limbs, most significant
        # first: bring down a limb, then find the largest digit q with
        # |divisor| * q <= rest by binary search.
        local i: int = this.length - 1;
        loop (i >= 0) {
            loop (local k: int = rest.length; k > 0; k = k - 1) {
                *(rest.limbs + k) = *(rest.limbs + (k - 1));
            }
            *rest.limbs = *(this.limbs + i);
            rest.length = rest.length + 1;
            rest.sign = 1;
            rest.normalize();

            local low: ulong = 0;
            local high: ulong = BIGINT_BASE - cast<ulong>(1);
            loop (low < high) {
                local middle: ulong = (low + high + cast<ulong>(1)) / cast<ulong>(2);
                local product: BigInt = BigInt.multiplyMagnitudeSmall(divisor, middle);
                local fits: bool = BigInt.compareMagnitude(&product, &rest) <= 0;
                product.destroy();
                if (fits) {
                    low = middle;
                } else {
                    high = middle - cast<ulong>(1);
                }
            }
            *(quotient.limbs + i) = cast<uint>(low);
            if (low > cast<ulong>(0)) {
                local taken: BigInt = BigInt.multiplyMagnitudeSmall(divisor, low);
                local smaller: BigInt = BigInt.subtractMagnitudes(&rest, &taken, 1);
                taken.destroy();
                # Keep the buffer large enough for the next limb.
                loop (local k: int = 0; k < smaller.length; k = k + 1) {
                    *(rest.limbs + k) = *(smaller.limbs + k);
                }
                rest.length = smaller.length;
                rest.sign = smaller.sign;
                smaller.destroy();
            }
            i = i - 1;
        }
        quotient.length = this.length;
        quotient.sign = this.sign * divisor.sign;
        quotient.normalize();
        if (rest.sign != 0) {
            rest.sign = this.sign;
        }
        if (remainder != nullptr) {
            *remainder = rest;
        } else {
            rest.destroy();
        }
        return quotient;
    }

    # Decimal text of the value. Returns a newly allocated string the caller
    # must free, or nullptr if allocation fails.
    frame toString(this: *BigInt) ret string {
        local output: string = cast<string>(malloc((cast<long>(this.length) * 9) + 3));
        if (output == nullptr) {
            return output;
        }
        if (this.sign == 0) {
            sprintf(output, "0");
            return output;
        }
        local used: int = 0;
        if (this.sign < 0) {
            used = sprintf(output, "-");
        }
        used = used + sprintf(output + used, "%u", *(this.limbs + (this.length - 1)));
        local i: int = this.length - 2;
        loop (i >= 0) {
            used = used + sprintf(output + used, "%09u", *(this.limbs + i));
            i = i - 1;
        }
        return output;
    }
}
