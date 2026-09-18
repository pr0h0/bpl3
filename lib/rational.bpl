# Rational number (fraction) arithmetic

export [Rational];

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

        # Normalize sign (denominator always positive)
        if (r.den < cast<long>(0)) {
            r.num = -r.num;
            r.den = -r.den;
        }
        r.simplify();
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
    frame gcd(a: long, b: long) ret long {
        if (a < cast<long>(0)) {
            a = -a;
        }
        if (b < cast<long>(0)) {
            b = -b;
        }
        loop (b != cast<long>(0)) {
            local temp: long = b;
            b = a % b;
            a = temp;
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
    frame add(this: *Rational, other: Rational) ret Rational {
        local newNum: long = (this.num * other.den) + (other.num * this.den);
        local newDen: long = this.den * other.den;
        return Rational.new(newNum, newDen);
    }

    # Subtract two rationals
    frame sub(this: *Rational, other: Rational) ret Rational {
        local newNum: long = (this.num * other.den) - (other.num * this.den);
        local newDen: long = this.den * other.den;
        return Rational.new(newNum, newDen);
    }

    # Multiply two rationals
    frame mul(this: *Rational, other: Rational) ret Rational {
        return Rational.new(this.num * other.num, this.den * other.den);
    }

    # Divide two rationals
    frame div(this: *Rational, other: Rational) ret Rational {
        return Rational.new(this.num * other.den, this.den * other.num);
    }

    # Negate the rational
    frame negate(this: *Rational) ret Rational {
        return Rational.new(-this.num, this.den);
    }

    # Calculate the reciprocal (1/r)
    frame reciprocal(this: *Rational) ret Rational {
        return Rational.new(this.den, this.num);
    }

    # Calculate absolute value
    frame abs(this: *Rational) ret Rational {
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
        local exp: int = n;

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
