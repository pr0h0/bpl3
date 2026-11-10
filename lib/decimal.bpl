# Decimal: exact fixed-point decimal numbers for money and measurements.
#
# A Decimal is `units / 10^scale` with a signed 64-bit `units` and a scale
# of 0-18 fractional digits, so "12.34" is (1234, 2). Addition and
# subtraction align scales exactly; multiplication adds the scales; division
# and `rescale` round to a requested scale with an explicit rounding mode.
# Every operation throws "Decimal overflow" instead of wrapping.

export [Decimal];
export DECIMAL_ROUND_HALF_EVEN;
export DECIMAL_ROUND_HALF_UP;
export DECIMAL_ROUND_DOWN;
export DECIMAL_ROUND_UP;
export DECIMAL_ROUND_FLOOR;
export DECIMAL_ROUND_CEILING;

import [Option] from "std/option.bpl";
import [String] from "std/string.bpl";
import [StringBuilder] from "std/string_builder.bpl";

extern strlen(text: string) ret long;

# Banker's rounding: ties go to the even neighbour.
global DECIMAL_ROUND_HALF_EVEN: int = 0;
# Ties away from zero.
global DECIMAL_ROUND_HALF_UP: int = 1;
# Toward zero (truncation).
global DECIMAL_ROUND_DOWN: int = 2;
# Away from zero.
global DECIMAL_ROUND_UP: int = 3;
# Toward negative infinity.
global DECIMAL_ROUND_FLOOR: int = 4;
# Toward positive infinity.
global DECIMAL_ROUND_CEILING: int = 5;

global DECIMAL_MAX_SCALE: int = 18;

frame _decimalPow10(exponent: int) ret long {
    local result: long = 1;
    loop (local i: int = 0; i < exponent; i = i + 1) {
        result = result * 10;
    }
    return result;
}

frame _decimalCheckedMul(a: long, b: long) ret long {
    if ((a == cast<long>(0)) || (b == cast<long>(0))) {
        return 0;
    }
    local minimum: long = cast<long>(-9223372036854775807) - 1;
    if (((a == cast<long>(-1)) && (b == minimum)) || ((b == cast<long>(-1)) && (a == minimum))) {
        throw "Decimal overflow";
    }
    local product: long = a * b;
    if ((product / b) != a) {
        throw "Decimal overflow";
    }
    return product;
}

frame _decimalCheckedAdd(a: long, b: long) ret long {
    if ((b > cast<long>(0)) && (a > (cast<long>(9223372036854775807) - b))) {
        throw "Decimal overflow";
    }
    if ((b < cast<long>(0)) && (a < ((cast<long>(-9223372036854775807) - 1) - b))) {
        throw "Decimal overflow";
    }
    return a + b;
}

# numerator / denominator (denominator > 0) rounded with `mode`.
frame _decimalDivideRounded(numerator: long, denominator: long, mode: int) ret long {
    local quotient: long = numerator / denominator;
    local remainder: long = numerator % denominator;
    if (remainder == cast<long>(0)) {
        return quotient;
    }
    local negative: bool = numerator < cast<long>(0);
    local magnitude: long = remainder;
    if (magnitude < cast<long>(0)) {
        magnitude = -magnitude;
    }
    # Compare 2 * remainder with the denominator without overflow.
    local half: int = 0;
    if (magnitude > (denominator - magnitude)) {
        half = 1;
    } else if (magnitude == (denominator - magnitude)) {
        half = 0;
    } else {
        half = -1;
    }
    local awayFromZero: bool = false;
    if (mode == DECIMAL_ROUND_HALF_EVEN) {
        awayFromZero = (half > 0) || ((half == 0) && ((quotient % 2) != cast<long>(0)));
    } else if (mode == DECIMAL_ROUND_HALF_UP) {
        awayFromZero = half >= 0;
    } else if (mode == DECIMAL_ROUND_DOWN) {
        awayFromZero = false;
    } else if (mode == DECIMAL_ROUND_UP) {
        awayFromZero = true;
    } else if (mode == DECIMAL_ROUND_FLOOR) {
        awayFromZero = negative;
    } else if (mode == DECIMAL_ROUND_CEILING) {
        awayFromZero = !negative;
    } else {
        throw "Decimal: unknown rounding mode";
    }
    if (awayFromZero) {
        if (negative) {
            return quotient - 1;
        }
        return quotient + 1;
    }
    return quotient;
}

struct Decimal {
    units: long,
    scale: int,
    frame new(units: long, scale: int) ret Decimal {
        if ((scale < 0) || (scale > DECIMAL_MAX_SCALE)) {
            throw "Decimal scale must be 0-18";
        }
        return Decimal { units: units, scale: scale };
    }

    frame fromLong(value: long) ret Decimal {
        return Decimal { units: value, scale: 0 };
    }

    frame zero() ret Decimal {
        return Decimal { units: 0, scale: 0 };
    }

    # Parses "-12.340", "+3", ".5" or "7." keeping the written scale.
    frame parse(text: string) ret Option<Decimal> {
        if (text == nullptr) {
            return Option<Decimal>.None;
        }
        local n: long = strlen(text);
        local i: long = 0;
        local negative: bool = false;
        if ((n > cast<long>(0)) && ((text[0] == '-') || (text[0] == '+'))) {
            negative = text[0] == '-';
            i = 1;
        }
        local units: long = 0;
        local scale: int = 0;
        local digits: int = 0;
        local seenPoint: bool = false;
        loop (i < n) {
            local c: char = text[i];
            if ((c == '.') && !seenPoint) {
                seenPoint = true;
                i = i + 1;
                continue;
            }
            if ((c < '0') || (c > '9')) {
                return Option<Decimal>.None;
            }
            if (seenPoint) {
                if (scale == DECIMAL_MAX_SCALE) {
                    return Option<Decimal>.None;
                }
                scale = scale + 1;
            }
            local digit: long = cast<long>(cast<int>(c) - 48);
            if (units > ((cast<long>(9223372036854775807) - digit) / 10)) {
                return Option<Decimal>.None;
            }
            units = (units * 10) + digit;
            digits = digits + 1;
            i = i + 1;
        }
        if (digits == 0) {
            return Option<Decimal>.None;
        }
        if (negative) {
            units = -units;
        }
        return Option<Decimal>.Some(Decimal { units: units, scale: scale });
    }

    # Rounds `value * 10^scale` (computed in double precision) half-even,
    # so 2.675 at scale 2 gives 2.68 because 2.675 * 100.0 is exactly 267.5.
    frame fromFloat(value: float, scale: int) ret Decimal {
        if ((scale < 0) || (scale > DECIMAL_MAX_SCALE)) {
            throw "Decimal scale must be 0-18";
        }
        local scaled: float = value * cast<float>(_decimalPow10(scale));
        if ((scaled != scaled) || (scaled > 9223372036854775000.0) || (scaled < -9223372036854775000.0)) {
            throw "Decimal overflow";
        }
        local whole: long = cast<long>(scaled);
        local fraction: float = scaled - cast<float>(whole);
        if ((fraction > 0.5) || ((fraction == 0.5) && ((whole % 2) != cast<long>(0)))) {
            whole = whole + 1;
        } else if ((fraction < -0.5) || ((fraction == -0.5) && ((whole % 2) != cast<long>(0)))) {
            whole = whole - 1;
        }
        return Decimal { units: whole, scale: scale };
    }

    frame toFloat(this: *Decimal) ret float {
        return cast<float>(this.units) / cast<float>(_decimalPow10(this.scale));
    }

    # The same value at a larger scale (exact), or rounded to a smaller one.
    frame rescale(this: *Decimal, scale: int, mode: int) ret Decimal {
        if ((scale < 0) || (scale > DECIMAL_MAX_SCALE)) {
            throw "Decimal scale must be 0-18";
        }
        if (scale >= this.scale) {
            return Decimal { units: _decimalCheckedMul(this.units, _decimalPow10(scale - this.scale)), scale: scale };
        }
        return Decimal { units: _decimalDivideRounded(this.units, _decimalPow10(this.scale - scale), mode), scale: scale };
    }

    # Rounds to `scale` digits with banker's rounding.
    frame round(this: *Decimal, scale: int) ret Decimal {
        return this.rescale(scale, DECIMAL_ROUND_HALF_EVEN);
    }

    frame add(this: *Decimal, other: *Decimal) ret Decimal {
        local scale: int = this.scale;
        if (other.scale > scale) {
            scale = other.scale;
        }
        local a: Decimal = this.rescale(scale, DECIMAL_ROUND_DOWN);
        local b: Decimal = other.rescale(scale, DECIMAL_ROUND_DOWN);
        return Decimal { units: _decimalCheckedAdd(a.units, b.units), scale: scale };
    }

    frame subtract(this: *Decimal, other: *Decimal) ret Decimal {
        local negated: Decimal = other.negate();
        return this.add(&negated);
    }

    frame negate(this: *Decimal) ret Decimal {
        return Decimal { units: _decimalCheckedMul(this.units, -1), scale: this.scale };
    }

    frame abs(this: *Decimal) ret Decimal {
        if (this.units < cast<long>(0)) {
            return this.negate();
        }
        return *this;
    }

    # The exact product; its scale is the sum of the scales (at most 18).
    frame multiply(this: *Decimal, other: *Decimal) ret Decimal {
        local scale: int = this.scale + other.scale;
        if (scale > DECIMAL_MAX_SCALE) {
            throw "Decimal overflow";
        }
        return Decimal { units: _decimalCheckedMul(this.units, other.units), scale: scale };
    }

    # The quotient rounded to `scale` digits with `mode`. Throws on division
    # by zero.
    frame divide(this: *Decimal, other: *Decimal, scale: int, mode: int) ret Decimal {
        if (other.units == cast<long>(0)) {
            throw "Decimal division by zero";
        }
        if ((scale < 0) || (scale > DECIMAL_MAX_SCALE)) {
            throw "Decimal scale must be 0-18";
        }
        # units = this.units * 10^(scale + other.scale - this.scale) / other.units
        local shift: int = (scale + other.scale) - this.scale;
        local numerator: long = this.units;
        local denominator: long = other.units;
        if (shift >= 0) {
            numerator = _decimalCheckedMul(numerator, _decimalPow10(shift));
        } else {
            denominator = _decimalCheckedMul(denominator, _decimalPow10(-shift));
        }
        if (denominator < cast<long>(0)) {
            numerator = _decimalCheckedMul(numerator, -1);
            denominator = _decimalCheckedMul(denominator, -1);
        }
        return Decimal { units: _decimalDivideRounded(numerator, denominator, mode), scale: scale };
    }

    # Multiplies by a whole number.
    frame multiplyLong(this: *Decimal, factor: long) ret Decimal {
        return Decimal { units: _decimalCheckedMul(this.units, factor), scale: this.scale };
    }

    # Splits into `parts` amounts at this scale that differ by at most one
    # unit and sum exactly to this value (earlier parts get the extra units).
    frame allocate(this: *Decimal, parts: int, index: int) ret Decimal {
        if ((parts < 1) || (index < 0) || (index >= parts)) {
            throw "Decimal.allocate: bad part";
        }
        local share: long = this.units / cast<long>(parts);
        local remainder: long = this.units % cast<long>(parts);
        local units: long = share;
        if (remainder > cast<long>(0)) {
            if (cast<long>(index) < remainder) {
                units = units + 1;
            }
        } else if (remainder < cast<long>(0)) {
            if (cast<long>(index) < -remainder) {
                units = units - 1;
            }
        }
        return Decimal { units: units, scale: this.scale };
    }

    # Numeric comparison regardless of scale: negative, zero or positive.
    frame compare(this: *Decimal, other: *Decimal) ret int {
        local difference: Decimal = this.subtract(other);
        if (difference.units < cast<long>(0)) {
            return -1;
        }
        if (difference.units > cast<long>(0)) {
            return 1;
        }
        return 0;
    }

    frame equals(this: *Decimal, other: *Decimal) ret bool {
        return this.compare(other) == 0;
    }

    frame isZero(this: *Decimal) ret bool {
        return this.units == cast<long>(0);
    }

    frame isNegative(this: *Decimal) ret bool {
        return this.units < cast<long>(0);
    }

    # The value with trailing fractional zeros removed ("1.500" -> "1.5").
    frame normalize(this: *Decimal) ret Decimal {
        local units: long = this.units;
        local scale: int = this.scale;
        loop ((scale > 0) && ((units % 10) == cast<long>(0))) {
            units = units / 10;
            scale = scale - 1;
        }
        return Decimal { units: units, scale: scale };
    }

    # Text with exactly `scale` fractional digits, e.g. "-0.05". Returns a
    # new String the caller destroys.
    frame toString(this: *Decimal) ret String {
        local out: StringBuilder = StringBuilder.new(24);
        local magnitude: ulong = cast<ulong>(this.units);
        if (this.units < cast<long>(0)) {
            magnitude = cast<ulong>(0) - magnitude;
            out.appendChar('-');
        }
        local digits: char[24];
        local count: int = 0;
        loop {
            digits[count] = cast<char>(cast<int>(magnitude % cast<ulong>(10)) + 48);
            count = count + 1;
            magnitude = magnitude / cast<ulong>(10);
            if (magnitude == cast<ulong>(0)) {
                break;
            }
        }
        # Ensure at least one digit before the point.
        loop (count <= this.scale) {
            digits[count] = '0';
            count = count + 1;
        }
        loop (local i: int = count - 1; i >= 0; i = i - 1) {
            out.appendChar(digits[i]);
            if ((i == this.scale) && (this.scale > 0)) {
                out.appendChar('.');
            }
        }
        local result: String;
        result.data = out.buffer;
        result.length = out.length;
        return result;
    }
}
