# Complex number arithmetic

export [Complex];

import [Math] from "std/math.bpl";

# Scaling by a power of two is exact, and ldexp applies an exponent shift
# without forming the power itself, so a shift whose factor would not be
# representable still yields a representable result.
extern frexp(value: float, exponent: *int) ret float;
extern ldexp(value: float, exponent: int) ret float;

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
    /#
        Division by the scaled method: the smaller part of the divisor is
        divided by the larger one first, so nothing is squared at full
        magnitude. Forming the sum of squares directly overflows for large
        divisors and underflows for small ones, turning representable
        quotients into NaN or zero.
    #/
    frame div(this: *Complex, other: Complex) ret Complex {
        if ((other.real == 0.0) && (other.imag == 0.0)) {
            # Division by zero - return NaN-like values
            local zero: float = 0.0;
            return Complex.new(zero / zero, zero / zero);
        }

        # Scale each operand by a power of two taken from its largest
        # component, so both scaled operands have components of magnitude at
        # most one and the quotient below stays near one. Powers of two are
        # exact, and the two scales cancel into a single exponent shift that
        # ldexp applies at the end without ever forming the factor itself.
        #
        # Scaling by the magnitudes and reapplying them as two operations
        # cannot be made to work in either order: multiplying first overflows
        # for a large numerator over a small divisor, and dividing first
        # underflows a small component away, as for (1e200 + 1i) / (1e200),
        # whose imaginary part is 1e-200.
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

        local ar: float = ldexp(this.real, -valueExponent);
        local ai: float = ldexp(this.imag, -valueExponent);
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

        local shift: int = valueExponent - divisorExponent;
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
        local ea: float = Math.exp(this.real);
        return Complex.new(ea * Math.cos(this.imag), ea * Math.sin(this.imag));
    }

    # Calculate the natural logarithm ln(z) = ln|z| + i*arg(z)
    frame log(this: *Complex) ret Complex {
        return Complex.new(Math.log(this.abs()), this.phase());
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
        local r: float = this.abs();
        local theta: float = this.phase() / 2.0;
        local sqrtR: float = Math.sqrt(r);
        return Complex.new(sqrtR * Math.cos(theta), sqrtR * Math.sin(theta));
    }

    # Calculate sine: sin(z) = (e^(iz) - e^(-iz)) / (2i)
    frame sin(this: *Complex) ret Complex {
        local iz: Complex = Complex.new(-this.imag, this.real); # i * z
        local nizm: Complex = Complex.new(this.imag, -this.real); # -i * z
        local eiz: Complex = iz.exp();
        local eniz: Complex = nizm.exp();
        local diff: Complex = eiz.sub(eniz);
        return Complex.new(diff.imag / 2.0, -diff.real / 2.0);
    }

    # Calculate cosine: cos(z) = (e^(iz) + e^(-iz)) / 2
    frame cos(this: *Complex) ret Complex {
        local iz: Complex = Complex.new(-this.imag, this.real);
        local nizm: Complex = Complex.new(this.imag, -this.real);
        local eiz: Complex = iz.exp();
        local eniz: Complex = nizm.exp();
        local sum: Complex = eiz.add(eniz);
        return sum.scale(0.5);
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
