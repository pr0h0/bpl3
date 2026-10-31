# Rational number (fraction) arithmetic

export [Rational];

# Internal unsigned 128-bit intermediates for exact reduced addition.
struct RationalWide {
    hi: u64,
    lo: u64,
    frame product(a: u64, b: u64) ret RationalWide {
        local mask: u64 = 4294967295;
        local al: u64 = a & mask;
        local bl: u64 = b & mask;
        local ah: u64 = a >> 32;
        local bh: u64 = b >> 32;
        local low: u64 = al * bl;
        local left: u64 = al * bh;
        local right: u64 = ah * bl;
        local middle: u64 = (low >> 32) + (left & mask) + (right & mask);
        return RationalWide { hi: (ah * bh) + (left >> 32) + (right >> 32) + (middle >> 32), lo: (middle << 32) | (low & mask) };
    }
    frame divide(this: *RationalWide, divisor: u64) ret RationalWide {
        local result: RationalWide = RationalWide { hi: 0, lo: 0 };
        local remainder: u64 = 0;
        # Divisors are at most 2^63, so doubling a remainder fits u64.
        loop (local bit: int = 127; bit >= 0; bit = bit - 1) {
            local digit: u64 = 0;
            if (bit >= 64) {
                digit = (this.hi >> (bit - 64)) & cast<u64>(1);
            } else {
                digit = (this.lo >> bit) & cast<u64>(1);
            }
            remainder = (remainder << 1) | digit;
            if (remainder >= divisor) {
                remainder = remainder - divisor;
                if (bit >= 64) {
                    result.hi = result.hi | (cast<u64>(1) << (bit - 64));
                } else {
                    result.lo = result.lo | (cast<u64>(1) << bit);
                }
            }
        }
        return result;
    }
}

struct Rational {
    num: long,
    den: long,
    # numerator
    # denominator

    # Create a new rational number (automatically simplified)
    frame new(numerator: long, denominator: long) ret Rational {
        local r: Rational;
        if (denominator == cast<long>(0)) {
            # Division by zero - create invalid rational
            r.num = cast<long>(0);
            r.den = cast<long>(0);
            return r;
        }
        r.num = numerator;
        r.den = denominator;

        # Reduce before normalizing the sign. Negating the minimum long wraps,
        # so a value such as new(-9223372036854775808, -2) has to lose its
        # common factor before either side is negated.
        r.simplify();

        # A reduced denominator of LONG_MIN cannot be made positive. Likewise,
        # negating a reduced LONG_MIN numerator with negative denominator would
        # exceed long. Use the existing invalid sentinel for these values.
        if ((r.den == cast<long>(-9223372036854775808)) || ((r.num == cast<long>(-9223372036854775808)) && (r.den < cast<long>(0)))) {
            r.num = cast<long>(0);
            r.den = cast<long>(0);
            return r;
        }
        # Normalize sign (denominator always positive)
        if (r.den < cast<long>(0)) {
            r.num = -r.num;
            r.den = -r.den;
        }
        return r;
    }

    # Create a rational from an integer
    frame fromInt(value: int) ret Rational {
        return Rational.new(cast<long>(value), cast<long>(1));
    }

    # Create a rational from a long
    frame fromLong(value: long) ret Rational {
        return Rational.new(value, cast<long>(1));
    }

    # Create zero
    frame zero() ret Rational {
        return Rational.new(cast<long>(0), cast<long>(1));
    }

    # Create one
    frame one() ret Rational {
        return Rational.new(cast<long>(1), cast<long>(1));
    }

    # Calculate GCD using Euclidean algorithm
    /#
        Greatest common divisor, taking magnitudes only after the first
        remainder step. Negating the minimum long wraps, so taking magnitudes
        first would corrupt it; one remainder brings the operands into a range
        whose magnitude is representable.
    #/
    frame gcd(a: long, b: long) ret long {
        loop (b != cast<long>(0)) {
            # Every integer is divisible by -1. Avoid LONG_MIN % -1,
            # whose quotient is outside long even though its remainder is zero.
            if (b == cast<long>(-1)) {
                return cast<long>(1);
            }
            local temp: long = b;
            b = a % b;
            a = temp;
        }
        if (a < cast<long>(0)) {
            a = -a;
        }
        return a;
    }

    # Simplify the rational number to lowest terms
    frame simplify(this: *Rational) {
        if (this.den == cast<long>(0)) {
            return;
        }
        if (this.num == cast<long>(0)) {
            this.den = cast<long>(1);
            return;
        }
        local g: long = Rational.gcd(this.num, this.den);
        this.num = this.num / g;
        this.den = this.den / g;
    }

    # Add two rationals
    /#
        Addition that reduces as it goes. Multiplying each numerator by the
        other denominator overflows long before the reduced answer needs to:
        MAX/2 + MAX/2 is exactly MAX, but the cross products are not
        representable. The whole parts are added separately, and only the
        proper fractions are combined over the least common denominator.
    #/
    /# Greatest common divisor of two unsigned values. #/
    frame gcdWide(a: u64, b: u64) ret u64 {
        loop (b != cast<u64>(0)) {
            local temp: u64 = b;
            b = a % b;
            a = temp;
        }
        return a;
    }

    frame magnitude(value: long) ret u64 {
        if (value < cast<long>(0)) {
            return cast<u64>(0) - cast<u64>(value);
        }
        return cast<u64>(value);
    }

    frame addFractions(an: long, ad: long, bn: long, bd: long) ret Rational {
        return Rational.combine(an, ad, bn, bd, false);
    }

    # Add/subtract with exact wide cross-products, then reduce before testing
    # representability. This also handles subtraction of LONG_MIN directly.
    frame combine(an: long, ad: long, bn: long, bd: long, subtract: bool) ret Rational {
        if ((ad <= cast<long>(0)) || (bd <= cast<long>(0))) {
            return Rational.new(0, 0);
        }
        local common: u64 = Rational.gcdWide(cast<u64>(ad), cast<u64>(bd));
        local aScale: u64 = cast<u64>(ad) / common;
        local bScale: u64 = cast<u64>(bd) / common;
        local left: RationalWide = RationalWide.product(Rational.magnitude(an), bScale);
        local right: RationalWide = RationalWide.product(Rational.magnitude(bn), aScale);
        local negative: bool = an < cast<long>(0);
        local rightNegative: bool = (bn < cast<long>(0)) != subtract;
        local total: RationalWide;
        if (negative == rightNegative) {
            total.lo = left.lo + right.lo;
            local carry: u64 = 0;
            if (total.lo < left.lo) {
                carry = 1;
            }
            total.hi = left.hi + right.hi + carry;
        } else {
            if ((left.hi < right.hi) || ((left.hi == right.hi) && (left.lo < right.lo))) {
                local swap: RationalWide = left;
                left = right;
                right = swap;
                negative = rightNegative;
            }
            local borrow: u64 = 0;
            if (left.lo < right.lo) {
                borrow = 1;
            }
            total.lo = left.lo - right.lo;
            total.hi = left.hi - right.hi - borrow;
        }
        local quotient: RationalWide = total.divide(common);
        local remainder: u64 = total.lo - (quotient.lo * common);
        local factor: u64 = Rational.gcdWide(remainder, common);
        total = total.divide(factor);
        local denominatorPart: u64 = cast<u64>(bd) / factor;
        local maximum: u64 = 9223372036854775807;
        local limit: u64 = maximum;
        if (negative) {
            limit = limit + cast<u64>(1);
        }
        if ((total.hi != cast<u64>(0)) || (total.lo > limit) || (denominatorPart > (maximum / aScale))) {
            return Rational.new(0, 0);
        }
        local numerator: long = cast<long>(total.lo);
        if (negative) {
            numerator = cast<long>(cast<u64>(0) - total.lo);
        }
        return Rational.new(numerator, cast<long>(aScale * denominatorPart));
    }

    frame add(this: *Rational, other: Rational) ret Rational {
        return Rational.combine(this.num, this.den, other.num, other.den, false);
    }

    frame sub(this: *Rational, other: Rational) ret Rational {
        return Rational.combine(this.num, this.den, other.num, other.den, true);
    }

    # Cancel in unsigned magnitudes so LONG_MIN is representable during both
    # multiplication and reciprocal division; only final results must fit long.
    frame multiplyFractions(an: long, ad: long, bn: long, bd: long, divide: bool) ret Rational {
        if ((ad <= cast<long>(0)) || (bd <= cast<long>(0)) || (divide && (bn == cast<long>(0)))) {
            return Rational.new(0, 0);
        }
        local a: u64 = Rational.magnitude(an);
        local b: u64 = cast<u64>(ad);
        local c: u64 = Rational.magnitude(bn);
        local d: u64 = cast<u64>(bd);
        if (divide) {
            local swap: u64 = c;
            c = d;
            d = swap;
        }
        local factor: u64 = Rational.gcdWide(a, d);
        a = a / factor;
        d = d / factor;
        factor = Rational.gcdWide(c, b);
        c = c / factor;
        b = b / factor;
        local negative: bool = (an < cast<long>(0)) != (bn < cast<long>(0));
        local maximum: u64 = 9223372036854775807;
        local limit: u64 = maximum;
        if (negative) {
            limit = limit + cast<u64>(1);
        }
        if (((a != cast<u64>(0)) && (c > (limit / a))) || (d > (maximum / b))) {
            return Rational.new(0, 0);
        }
        local numerator: u64 = a * c;
        if (negative) {
            numerator = cast<u64>(0) - numerator;
        }
        return Rational.new(cast<long>(numerator), cast<long>(b * d));
    }

    frame mul(this: *Rational, other: Rational) ret Rational {
        return Rational.multiplyFractions(this.num, this.den, other.num, other.den, false);
    }

    frame div(this: *Rational, other: Rational) ret Rational {
        return Rational.multiplyFractions(this.num, this.den, other.num, other.den, true);
    }

    # Negate the rational
    frame negate(this: *Rational) ret Rational {
        if (this.num == cast<long>(-9223372036854775808)) {
            return Rational.new(0, 0);
        }
        return Rational.new(-this.num, this.den);
    }

    # Calculate the reciprocal (1/r)
    frame reciprocal(this: *Rational) ret Rational {
        return Rational.new(this.den, this.num);
    }

    # Calculate absolute value
    frame abs(this: *Rational) ret Rational {
        if (this.num == cast<long>(-9223372036854775808)) {
            return Rational.new(0, 0);
        }
        local n: long = this.num;
        if (n < cast<long>(0)) {
            n = -n;
        }
        return Rational.new(n, this.den);
    }

    # Calculate r^n for integer exponent
    frame pow(this: *Rational, n: int) ret Rational {
        if (n == 0) {
            return Rational.one();
        }
        local result: Rational = Rational.one();
        local base: Rational = *this;
        # Widen before negating so INT_MIN becomes a positive magnitude.
        local exp: long = cast<long>(n);

        if (exp < 0) {
            base = base.reciprocal();
            exp = -exp;
        }
        loop (exp > 0) {
            if ((exp % 2) == 1) {
                result = result.mul(base);
            }
            base = base.mul(base);
            exp = exp / 2;
        }

        return result;
    }

    # Convert to float
    frame toFloat(this: *Rational) ret float {
        if (this.den == cast<long>(0)) {
            return 0.0 / 0.0; # NaN
        }
        return cast<float>(this.num) / cast<float>(this.den);
    }

    # Convert to integer (truncates)
    frame toInt(this: *Rational) ret int {
        if (this.den == cast<long>(0)) {
            return 0;
        }
        return cast<int>(this.num / this.den);
    }

    # Convert to long (truncates)
    frame toLong(this: *Rational) ret long {
        if (this.den == cast<long>(0)) {
            return cast<long>(0);
        }
        return this.num / this.den;
    }

    # Floor - largest integer <= rational
    frame floor(this: *Rational) ret long {
        if (this.den == cast<long>(0)) {
            return cast<long>(0);
        }
        local q: long = this.num / this.den;
        if ((this.num < cast<long>(0)) && ((this.num % this.den) != cast<long>(0))) {
            q = q - cast<long>(1);
        }
        return q;
    }

    # Ceiling - smallest integer >= rational
    frame ceil(this: *Rational) ret long {
        if (this.den == cast<long>(0)) {
            return cast<long>(0);
        }
        local q: long = this.num / this.den;
        if ((this.num > cast<long>(0)) && ((this.num % this.den) != cast<long>(0))) {
            q = q + cast<long>(1);
        }
        return q;
    }

    # Round to nearest integer
    /#
        Round to nearest, halves away from the lower value. The remainder is
        compared against what is left of the denominator rather than doubling
        the numerator, which overflows for a large whole part.
    #/
    frame round(this: *Rational) ret long {
        if (this.den == cast<long>(0)) {
            return cast<long>(0);
        }
        local whole: long = Rational.floorDiv(this.num, this.den);
        local remainder: long = this.num - (whole * this.den);
        if (remainder >= (this.den - remainder)) {
            return whole + cast<long>(1);
        }
        return whole;
    }

    # Check if valid (denominator != 0)
    frame isValid(this: *Rational) ret bool {
        return this.den != cast<long>(0);
    }

    # Check if zero
    frame isZero(this: *Rational) ret bool {
        return (this.num == cast<long>(0)) && (this.den != cast<long>(0));
    }

    # Check if positive
    frame isPositive(this: *Rational) ret bool {
        return (this.num > cast<long>(0)) && (this.den > cast<long>(0));
    }

    # Check if negative
    frame isNegative(this: *Rational) ret bool {
        return (this.num < cast<long>(0)) && (this.den > cast<long>(0));
    }

    # Check if this is an integer (denominator is 1)
    frame isInteger(this: *Rational) ret bool {
        return this.den == cast<long>(1);
    }

    # Compare two rationals
    # Returns -1 if this < other, 0 if equal, 1 if this > other
    /#
        Floor division for a positive divisor. Division truncates toward zero,
        so a negative dividend needs one subtracted when it does not divide
        evenly.
    #/
    frame floorDiv(value: long, divisor: long) ret long {
        local q: long = value / divisor;
        if ((value < cast<long>(0)) && ((value % divisor) != cast<long>(0))) {
            q = q - cast<long>(1);
        }
        return q;
    }

    /#
        Compare two fractions without cross-multiplying, which overflows for
        large numerators even when the answer is obvious. Compares whole parts
        first, then the remainders through their reciprocals, which reverses
        the ordering at each step. Denominators are normalized positive, and
        each quotient times its denominator is bounded by its numerator, so no
        product here can overflow.
    #/
    frame compare(this: *Rational, other: *Rational) ret int {
        # A zero denominator is the invalid sentinel this file's constructor
        # produces, and dividing by it would stop the program. Order it below
        # every valid value so the comparison stays total and deterministic.
        if (this.den == cast<long>(0)) {
            if (other.den == cast<long>(0)) {
                return 0;
            }
            return -1;
        }
        if (other.den == cast<long>(0)) {
            return 1;
        }
        local an: long = this.num;
        local ad: long = this.den;
        local bn: long = other.num;
        local bd: long = other.den;
        local flip: int = 1;

        loop (true) {
            local aq: long = Rational.floorDiv(an, ad);
            local bq: long = Rational.floorDiv(bn, bd);
            if (aq != bq) {
                if (aq < bq) {
                    return -flip;
                }
                return flip;
            }
            local ar: long = an - (aq * ad);
            local br: long = bn - (bq * bd);
            if ((ar == cast<long>(0)) && (br == cast<long>(0))) {
                return 0;
            }
            if (ar == cast<long>(0)) {
                return -flip;
            }
            if (br == cast<long>(0)) {
                return flip;
            }

            # Compare the reciprocals of the remainders instead.
            local nextAn: long = ad;
            local nextAd: long = ar;
            local nextBn: long = bd;
            local nextBd: long = br;
            an = nextAn;
            ad = nextAd;
            bn = nextBn;
            bd = nextBd;
            flip = -flip;
        }
        return 0;
    }

    # Check equality
    frame equals(this: *Rational, other: *Rational) ret bool {
        return (this.num == other.num) && (this.den == other.den);
    }

    # Check if this < other
    frame lessThan(this: *Rational, other: *Rational) ret bool {
        return this.compare(other) < 0;
    }

    # Check if this <= other
    frame lessEqual(this: *Rational, other: *Rational) ret bool {
        return this.compare(other) <= 0;
    }

    # Check if this > other
    frame greaterThan(this: *Rational, other: *Rational) ret bool {
        return this.compare(other) > 0;
    }

    # Check if this >= other
    frame greaterEqual(this: *Rational, other: *Rational) ret bool {
        return this.compare(other) >= 0;
    }

    # Get the sign: -1 for negative, 0 for zero, 1 for positive
    frame sign(this: *Rational) ret int {
        if (this.num > cast<long>(0)) {
            return 1;
        }
        if (this.num < cast<long>(0)) {
            return -1;
        }
        return 0;
    }

    # Clone
    frame clone(this: *Rational) ret Rational {
        local r: Rational;
        r.num = this.num;
        r.den = this.den;
        return r;
    }

    # Get numerator
    frame numerator(this: *Rational) ret long {
        return this.num;
    }

    # Get denominator
    frame denominator(this: *Rational) ret long {
        return this.den;
    }

    # Operator overloads
    frame __add__(this: *Rational, other: *Rational) ret Rational {
        return this.add(*other);
    }

    frame __sub__(this: *Rational, other: *Rational) ret Rational {
        return this.sub(*other);
    }

    frame __mul__(this: *Rational, other: *Rational) ret Rational {
        return this.mul(*other);
    }

    frame __div__(this: *Rational, other: *Rational) ret Rational {
        return this.div(*other);
    }

    frame __eq__(this: *Rational, other: *Rational) ret bool {
        return this.equals(other);
    }

    frame __ne__(this: *Rational, other: *Rational) ret bool {
        return !this.equals(other);
    }

    frame __lt__(this: *Rational, other: *Rational) ret bool {
        return this.compare(other) < 0;
    }

    frame __le__(this: *Rational, other: *Rational) ret bool {
        return this.compare(other) <= 0;
    }

    frame __gt__(this: *Rational, other: *Rational) ret bool {
        return this.compare(other) > 0;
    }

    frame __ge__(this: *Rational, other: *Rational) ret bool {
        return this.compare(other) >= 0;
    }

    frame __neg__(this: *Rational) ret Rational {
        return this.negate();
    }
}
