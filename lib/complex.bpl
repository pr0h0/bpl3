# Complex number arithmetic

export [Complex];

import [Math] from "std/math.bpl";

# Scaling by a power of two is exact, and ldexp applies an exponent shift
# without forming the power itself, so a shift whose factor would not be
# representable still yields a representable result.
extern frexp(value: float, exponent: *int) ret float;
extern ldexp(value: float, exponent: int) ret float;
extern log1p(value: float) ret float;

# Multiply by a weighted exponential without first overflowing its magnitude.
# Four equal factors keep every intermediate finite when the result fits.
# The negative tail also avoids rounding a subnormal exponential before use.
frame complexExpProduct(exponent: float, factor: float, weight: float) ret float {
    if (factor == 0.0) {
        return factor;
    }
    local quarter: float = Math.exp(exponent * 0.25);
    return (((factor * (quarter * weight)) * quarter) * quarter) * quarter;
}

# Signed sinh and positive cosh, using only the existing exponential provider.
# The small-input series avoids subtracting nearly equal exponentials.
frame complexHyperbolicParts(value: float) ret (float, float) {
    if (value == 0.0) {
        return (value, 1.0);
    }
    local magnitude: float = Math.abs(value);
    if (magnitude < 0.5) {
        local square: float = magnitude * magnitude;
        local oddTerm: float = magnitude;
        local evenTerm: float = 1.0;
        local odd: float = magnitude;
        local even: float = 1.0;
        loop (local n: int = 1; n <= 7; n = n + 1) {
            oddTerm = (oddTerm * square) / cast<float>((2 * n) * ((2 * n) + 1));
            evenTerm = (evenTerm * square) / cast<float>(((2 * n) - 1) * (2 * n));
            odd = odd + oddTerm;
            even = even + evenTerm;
        }
        return (Math.copysign(odd, value), even);
    }
    local half: float = Math.exp(magnitude * 0.5);
    local leading: float = (half * 0.5) * half;
    local trailing: float = (0.5 / half) / half;
    return (Math.copysign(leading - trailing, value), leading + trailing);
}

struct Complex {
    real: float,
    imag: float,
    # Create a new complex number
    frame new(real: float, imag: float) ret Complex {
        local c: Complex;
        c.real = real;
        c.imag = imag;
        return c;
    }

    # Create a complex number from just a real part
    frame fromReal(real: float) ret Complex {
        return Complex.new(real, 0.0);
    }

    # Create a complex number from just an imaginary part
    frame fromImag(imag: float) ret Complex {
        return Complex.new(0.0, imag);
    }

    # Create a complex number from polar form (magnitude and angle in radians)
    frame fromPolar(magnitude: float, angle: float) ret Complex {
        return Complex.new(magnitude * Math.cos(angle), magnitude * Math.sin(angle));
    }

    # Return the zero complex number
    frame zero() ret Complex {
        return Complex.new(0.0, 0.0);
    }

    # Return the complex number 1 + 0i
    frame one() ret Complex {
        return Complex.new(1.0, 0.0);
    }

    # Return the imaginary unit i (0 + 1i)
    frame i() ret Complex {
        return Complex.new(0.0, 1.0);
    }

    # Add two complex numbers
    frame add(this: *Complex, other: Complex) ret Complex {
        return Complex.new(this.real + other.real, this.imag + other.imag);
    }

    # Subtract two complex numbers
    frame sub(this: *Complex, other: Complex) ret Complex {
        return Complex.new(this.real - other.real, this.imag - other.imag);
    }

    # Multiply two complex numbers
    # (a + bi)(c + di) = (ac - bd) + (ad + bc)i
    frame mul(this: *Complex, other: Complex) ret Complex {
        local r: float = (this.real * other.real) - (this.imag * other.imag);
        local i: float = (this.real * other.imag) + (this.imag * other.real);
        return Complex.new(r, i);
    }

    # Divide two complex numbers
    # (a + bi)/(c + di) = ((ac + bd) + (bc - ad)i) / (c² + d²)
    # Keep each product's exponent separately until the final division. A
    # shared scale can erase a tiny component that still contributes to a
    # representable quotient after multiplication by a large component.
    frame _divideProducts(a: float, b: float, c: float, d: float, denominator: float, divisorExponent: int) ret float {
        local ae: int = 0;
        local be: int = 0;
        local ce: int = 0;
        local de: int = 0;
        local am: float = frexp(a, &ae);
        local bm: float = frexp(b, &be);
        local cm: float = frexp(c, &ce);
        local dm: float = frexp(d, &de);
        local first: float = am * bm;
        local second: float = cm * dm;
        local firstExponent: int = ae + be;
        local secondExponent: int = ce + de;
        # Zero must not force a nonzero product into a smaller exponent range.
        if (first == 0.0) {
            firstExponent = secondExponent;
        }
        if (second == 0.0) {
            secondExponent = firstExponent;
        }
        local exponent: int = firstExponent;
        if (secondExponent > exponent) {
            exponent = secondExponent;
        }
        local sum: float = ldexp(first, firstExponent - exponent) + ldexp(second, secondExponent - exponent);
        return ldexp(sum / denominator, exponent - (2 * divisorExponent));
    }

    frame div(this: *Complex, other: Complex) ret Complex {
        if ((other.real == 0.0) && (other.imag == 0.0)) {
            # Division by zero - return NaN-like values
            local zero: float = 0.0;
            return Complex.new(zero / zero, zero / zero);
        }

        # Ordinary values use Smith's ratio formula. Extreme exponents use
        # independent product scaling below to retain small contributions.
        local valueMax: float = Math.abs(this.real);
        local valueImagSize: float = Math.abs(this.imag);
        if (valueMax < valueImagSize) {
            valueMax = valueImagSize;
        }
        # A zero numerator keeps the signs of its components through the
        # ordinary path below.
        if (valueMax == 0.0) {
            valueMax = 1.0;
        }
        local divisorMax: float = Math.abs(other.real);
        local divisorImagSize: float = Math.abs(other.imag);
        if (divisorMax < divisorImagSize) {
            divisorMax = divisorImagSize;
        }
        local valueExponent: int = 0;
        local divisorExponent: int = 0;
        frexp(valueMax, &valueExponent);
        frexp(divisorMax, &divisorExponent);

        # Use separate product exponents at extreme magnitudes, where even
        # the smaller divisor component can disappear under a shared scale.
        # Keep the ordinary path's signed-zero conventions for ordinary data.
        local small: float = ldexp(1.0, -500);
        if (((this.real != 0.0) || (this.imag != 0.0)) && ((Math.abs(cast<float>(valueExponent)) > 500.0) || (Math.abs(cast<float>(divisorExponent)) > 500.0) || ((this.real != 0.0) && (Math.abs(this.real) < small)) || ((this.imag != 0.0) && (Math.abs(this.imag) < small)) || ((other.real != 0.0) && (Math.abs(other.real) < small)) || ((other.imag != 0.0) && (Math.abs(other.imag) < small)))) {
            local dr: float = ldexp(other.real, -divisorExponent);
            local di: float = ldexp(other.imag, -divisorExponent);
            local denominator: float = (dr * dr) + (di * di);
            return Complex.new(Complex._divideProducts(this.real, other.real, this.imag, other.imag, denominator, divisorExponent), Complex._divideProducts(this.imag, other.real, -this.real, other.imag, denominator, divisorExponent));
        }
        local ar: float = this.real;
        local ai: float = this.imag;
        local cr: float = ldexp(other.real, -divisorExponent);
        local ci: float = ldexp(other.imag, -divisorExponent);

        local realPart: float = 0.0;
        local imagPart: float = 0.0;
        if (Math.abs(cr) >= Math.abs(ci)) {
            local ratio: float = ci / cr;
            local denom: float = cr + (ci * ratio);
            realPart = (ar + (ai * ratio)) / denom;
            imagPart = (ai - (ar * ratio)) / denom;
        } else {
            local ratio: float = cr / ci;
            local denom: float = (cr * ratio) + ci;
            realPart = ((ar * ratio) + ai) / denom;
            imagPart = ((ai * ratio) - ar) / denom;
        }

        local shift: int = -divisorExponent;
        return Complex.new(ldexp(realPart, shift), ldexp(imagPart, shift));
    }

    # Multiply by a scalar
    frame scale(this: *Complex, scalar: float) ret Complex {
        return Complex.new(this.real * scalar, this.imag * scalar);
    }

    /#
        Calculate the magnitude (absolute value) |z| = sqrt(a² + b²).

        Squaring both components directly overflows for large ones and
        underflows for small ones, even when the magnitude itself is finite,
        so the larger component is factored out first and only their ratio is
        squared.
    #/
    frame abs(this: *Complex) ret float {
        # An infinite component gives an infinite magnitude whatever the other
        # one is, including NaN. Checking this first also keeps the ratio below
        # from dividing infinity by infinity.
        if (Math.isInfinite(this.real)) {
            return Math.abs(this.real);
        }
        if (Math.isInfinite(this.imag)) {
            return Math.abs(this.imag);
        }
        # A NaN component makes the magnitude NaN. Comparisons against NaN are
        # unordered, so it would otherwise fall through the ordering below and
        # be lost to the zero shortcut.
        if (Math.isNan(this.real) || Math.isNan(this.imag)) {
            return this.real + this.imag;
        }
        local larger: float = Math.abs(this.real);
        local smaller: float = Math.abs(this.imag);
        if (larger < smaller) {
            local swap: float = larger;
            larger = smaller;
            smaller = swap;
        }
        if (larger == 0.0) {
            return 0.0;
        }
        local ratio: float = smaller / larger;
        return larger * Math.sqrt(1.0 + (ratio * ratio));
    }

    # Calculate the magnitude squared |z|² = a² + b²
    frame absSquared(this: *Complex) ret float {
        return (this.real * this.real) + (this.imag * this.imag);
    }

    # Calculate the phase/argument (angle in radians)
    frame phase(this: *Complex) ret float {
        return Math.atan2(this.imag, this.real);
    }

    # Calculate the complex conjugate (a - bi)
    frame conjugate(this: *Complex) ret Complex {
        return Complex.new(this.real, -this.imag);
    }

    # Calculate the negation (-a - bi)
    frame negate(this: *Complex) ret Complex {
        return Complex.new(-this.real, -this.imag);
    }

    # Calculate the reciprocal 1/z
    frame reciprocal(this: *Complex) ret Complex {
        if ((this.real == 0.0) && (this.imag == 0.0)) {
            local zero: float = 0.0;
            return Complex.new(zero / zero, zero / zero);
        }
        # One divided by this value, scaled the same way as div.
        return Complex.one().div(*this);
    }

    # Calculate e^z = e^a * (cos(b) + i*sin(b))
    frame exp(this: *Complex) ret Complex {
        if (this.imag == 0.0) {
            return Complex.new(Math.exp(this.real), this.imag);
        }
        if (Math.isInfinite(this.real) && (Math.isNan(this.imag) || Math.isInfinite(this.imag))) {
            if (this.real < 0.0) {
                return Complex.new(0.0, Math.copysign(0.0, this.imag));
            }
            return Complex.new(this.real, this.imag - this.imag);
        }
        local radial: float = Math.exp(this.real);
        if (!Math.isInfinite(radial) && (this.real >= -700.0)) {
            return Complex.new(radial * Math.cos(this.imag), radial * Math.sin(this.imag));
        }
        return Complex.new(complexExpProduct(this.real, Math.cos(this.imag), 1.0), complexExpProduct(this.real, Math.sin(this.imag), 1.0));
    }

    # Calculate the natural logarithm ln(z) = ln|z| + i*arg(z)
    frame log(this: *Complex) ret Complex {
        # Compute log(magnitude) without first rounding or overflowing the
        # magnitude itself. log1p preserves tiny corrections near unit size.
        if (Math.isInfinite(this.real) || Math.isInfinite(this.imag) || Math.isNan(this.real) || Math.isNan(this.imag)) {
            return Complex.new(Math.log(this.abs()), this.phase());
        }
        local larger: float = Math.abs(this.real);
        local smaller: float = Math.abs(this.imag);
        if (larger < smaller) {
            local swap: float = larger;
            larger = smaller;
            smaller = swap;
        }
        if (larger == 0.0) {
            return Complex.new(Math.log(larger), this.phase());
        }
        local ratio: float = smaller / larger;
        return Complex.new(Math.log(larger) + (0.5 * log1p(ratio * ratio)), this.phase());
    }

    # Calculate z^n for integer n
    frame pow(this: *Complex, n: int) ret Complex {
        if (n == 0) {
            return Complex.one();
        }
        local result: Complex = Complex.one();
        local base: Complex = *this;
        # Widen before negating: negating the minimum int leaves it negative,
        # which would skip the loop and return one.
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

    # Calculate z^w for complex exponent using z^w = e^(w*ln(z))
    frame pow(this: *Complex, exponent: Complex) ret Complex {
        local lnz: Complex = this.log();
        local wlnz: Complex = exponent.mul(lnz);
        return wlnz.exp();
    }

    # Calculate the square root
    frame sqrt(this: *Complex) ret Complex {
        if (Math.isInfinite(this.imag)) {
            return Complex.new(Math.abs(this.imag), this.imag);
        }
        if (Math.isInfinite(this.real)) {
            if (this.real > 0.0) {
                if (Math.isNan(this.imag)) {
                    return Complex.new(this.real, this.imag);
                }
                return Complex.new(this.real, Math.copysign(0.0, this.imag));
            }
            if (Math.isNan(this.imag)) {
                return Complex.new(this.imag, Math.copysign(-this.real, this.imag));
            }
            return Complex.new(0.0, Math.copysign(-this.real, this.imag));
        }
        if (Math.isNan(this.real) || Math.isNan(this.imag)) {
            local nan: float = this.real + this.imag;
            return Complex.new(nan, nan);
        }
        if ((this.real == 0.0) && (this.imag == 0.0)) {
            return Complex.new(0.0, this.imag);
        }

        # An even exponent keeps the dominant component bounded while its
        # square-root scale can be restored exactly without forming |z|.
        local largest: float = Math.max(Math.abs(this.real), Math.abs(this.imag));
        local exponent: int = 0;
        frexp(largest, &exponent);
        if ((exponent % 2) != 0) {
            exponent = exponent - 1;
        }
        local real: float = ldexp(this.real, -exponent);
        local imag: float = ldexp(this.imag, -exponent);
        local magnitude: float = Math.sqrt((real * real) + (imag * imag));
        if (this.real >= 0.0) {
            local root: float = ldexp(Math.sqrt((magnitude + real) * 0.5), exponent / 2);
            # Use the original component here: normalization may erase a
            # tiny value whose resulting root component is representable.
            return Complex.new(root, this.imag / (2.0 * root));
        }
        local root: float = ldexp(Math.sqrt((magnitude - real) * 0.5), exponent / 2);
        return Complex.new(Math.abs(this.imag) / (2.0 * root), Math.copysign(root, this.imag));
    }

    # Calculate sine using sin(x)cosh(y) + i*cos(x)sinh(y).
    frame sin(this: *Complex) ret Complex {
        local (odd: float, even: float) = complexHyperbolicParts(this.imag);
        if (this.real == 0.0) {
            return Complex.new(this.real, odd);
        }
        local sine: float = Math.sin(this.real);
        local cosine: float = Math.cos(this.real);
        if (this.imag == 0.0) {
            if (Math.isNan(sine)) {
                return Complex.new(sine, this.imag);
            }
            return Complex.new(sine, cosine * this.imag);
        }
        if (Math.isInfinite(this.imag) && (Math.isNan(sine) || Math.isNan(cosine))) {
            return Complex.new(sine, Math.abs(this.imag));
        }
        if (Math.isInfinite(even)) {
            local sign: float = Math.copysign(1.0, this.imag);
            return Complex.new(complexExpProduct(Math.abs(this.imag), sine, 0.5), complexExpProduct(Math.abs(this.imag), cosine, 0.5) * sign);
        }
        return Complex.new(sine * even, cosine * odd);
    }

    # Calculate cosine using cos(x)cosh(y) - i*sin(x)sinh(y).
    frame cos(this: *Complex) ret Complex {
        local (odd: float, even: float) = complexHyperbolicParts(this.imag);
        if (this.real == 0.0) {
            if (Math.isNan(this.imag)) {
                return Complex.new(even, 0.0);
            }
            return Complex.new(even, -this.real * Math.copysign(1.0, this.imag));
        }
        local sine: float = Math.sin(this.real);
        local cosine: float = Math.cos(this.real);
        if (this.imag == 0.0) {
            if (Math.isNan(cosine)) {
                return Complex.new(cosine, 0.0);
            }
            return Complex.new(cosine, -sine * this.imag);
        }
        if (Math.isInfinite(this.imag) && (Math.isNan(sine) || Math.isNan(cosine))) {
            return Complex.new(Math.abs(this.imag), cosine);
        }
        if (Math.isInfinite(even)) {
            local sign: float = Math.copysign(1.0, this.imag);
            return Complex.new(complexExpProduct(Math.abs(this.imag), cosine, 0.5), -complexExpProduct(Math.abs(this.imag), sine, 0.5) * sign);
        }
        return Complex.new(cosine * even, -sine * odd);
    }

    # Check if two complex numbers are equal
    frame equals(this: *Complex, other: *Complex) ret bool {
        return (this.real == other.real) && (this.imag == other.imag);
    }

    # Check if two complex numbers are approximately equal
    frame approxEquals(this: *Complex, other: *Complex, epsilon: float) ret bool {
        local dr: float = this.real - other.real;
        local di: float = this.imag - other.imag;
        if (dr < 0.0) {
            dr = -dr;
        }
        if (di < 0.0) {
            di = -di;
        }
        return (dr < epsilon) && (di < epsilon);
    }

    # Check if this is a real number (imaginary part is 0)
    frame isReal(this: *Complex) ret bool {
        return this.imag == 0.0;
    }

    # Check if this is purely imaginary (real part is 0)
    frame isImaginary(this: *Complex) ret bool {
        return this.real == 0.0;
    }

    # Check if this is zero
    frame isZero(this: *Complex) ret bool {
        return (this.real == 0.0) && (this.imag == 0.0);
    }

    # Clone this complex number
    frame clone(this: *Complex) ret Complex {
        return Complex.new(this.real, this.imag);
    }

    # Operator overloads
    frame __add__(this: *Complex, other: *Complex) ret Complex {
        return this.add(*other);
    }

    frame __sub__(this: *Complex, other: *Complex) ret Complex {
        return this.sub(*other);
    }

    frame __mul__(this: *Complex, other: *Complex) ret Complex {
        return this.mul(*other);
    }

    frame __div__(this: *Complex, other: *Complex) ret Complex {
        return this.div(*other);
    }

    frame __eq__(this: *Complex, other: *Complex) ret bool {
        return this.equals(other);
    }

    frame __ne__(this: *Complex, other: *Complex) ret bool {
        return !this.equals(other);
    }

    frame __neg__(this: *Complex) ret Complex {
        return this.negate();
    }
}
