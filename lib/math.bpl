# Math helpers

import sqrt, sin, cos, pow, exp, log, floor, ceil, round, fabs, minnum, maxnum, copysign from "./intrinsics.bpl";

# Arc tangent has no LLVM intrinsic mapping here, so it comes from the
# platform math library, as the accuracy note on Math.atan explains.
extern atan(x: float) ret float;
extern atan2(y: float, x: float) ret float;
extern fmod(x: float, y: float) ret float;

export [Math];

# Mathematical constants
global const PI: float = 3.14159265358979323846;
global const E: float = 2.71828182845904523536;
global const TAU: float = 6.28318530717958647692;
global const SQRT2: float = 1.41421356237309504880;
global const LN2: float = 0.69314718055994530942;
global const LN10: float = 2.30258509299404568402;

export {PI};
export {E};
export {TAU};
export {SQRT2};
export {LN2};
export {LN10};

/#
# Math Utilities
Provides common mathematical functions for integers and floating-point numbers.
#/
struct Math {
    /#
    # Absolute Value (Int)
    Returns the absolute value of an integer.
    #/
    frame abs(x: int) ret int {
        if (x < 0) {
            return -x;
        }
        return x;
    }

    /#
    # Absolute Value (Float)
    Returns the absolute value of a float.
    #/
    /#
        True when x is NaN, which is the only value unequal to itself.
    #/
    frame isNan(x: float) ret bool {
        return x != x;
    }

    /#
        True when x is positive or negative infinity. Halving any finite
        non-zero value changes it; halving an infinity does not.
    #/
    frame isInfinite(x: float) ret bool {
        if (x != x) {
            return false;
        }
        if (x == 0.0) {
            return false;
        }
        return (x * 0.5) == x;
    }

    frame abs(x: float) ret float {
        return fabs(x);
    }

    /#
    # Minimum (Int)
    Returns the smaller of two integers.
    #/
    frame min(a: int, b: int) ret int {
        if (a < b) {
            return a;
        }
        return b;
    }

    /#
    # Maximum (Int)
    Returns the larger of two integers.
    #/
    frame max(a: int, b: int) ret int {
        if (a > b) {
            return a;
        }
        return b;
    }

    /#
    # Minimum (Float)
    Returns the smaller of two floats.
    #/
    frame min(a: float, b: float) ret float {
        return minnum(a, b);
    }

    /#
    # Maximum (Float)
    Returns the larger of two floats.
    #/
    frame max(a: float, b: float) ret float {
        return maxnum(a, b);
    }

    /#
    # Square Root (Float)
    Calculates the square root of a float.
    #/
    frame sqrt(x: float) ret float {
        return sqrt(x);
    }

    frame sin(x: float) ret float {
        return sin(x);
    }
    frame cos(x: float) ret float {
        return cos(x);
    }
    frame pow(x: float, y: float) ret float {
        return pow(x, y);
    }
    frame exp(x: float) ret float {
        return exp(x);
    }
    frame log(x: float) ret float {
        return log(x);
    }
    frame floor(x: float) ret float {
        return floor(x);
    }
    frame ceil(x: float) ret float {
        return ceil(x);
    }
    frame round(x: float) ret float {
        return round(x);
    }
    frame copysign(x: float, y: float) ret float {
        return copysign(x, y);
    }

    # Trigonometric functions
    frame tan(x: float) ret float {
        return sin(x) / cos(x);
    }

    frame asin(x: float) ret float {
        # Approximation using Taylor series for small x, Newton's method otherwise
        # For simplicity, use the identity: asin(x) = atan(x / sqrt(1 - x*x))
        if (x >= 1.0) 
            return PI / 2.0;
        if (x <= -1.0) 
            return -PI / 2.0;
        return Math.atan(x / sqrt(1.0 - (x * x)));
    }

    frame acos(x: float) ret float {
        return (PI / 2.0) - Math.asin(x);
    }

    /#
        Arc tangent, from the platform math library.

        This was a four-term Taylor series with the reciprocal identity above
        one. That series is about 0.0616 radians, or 3.5 degrees, wrong at
        x = 1, and switching to the identity just past one reversed the sign of
        that error, so the result jumped by roughly 0.123 radians across an
        input change of 1e-12. asin, acos, atan2, and complex phase are all
        built on this function and inherited both problems.
    #/
    frame atan(x: float) ret float {
        return atan(x);
    }

    /#
        Two-argument arc tangent, from the platform math library.

        The quadrant logic this replaces divided the arguments before choosing
        a branch, so infinity over infinity became indeterminate, a NaN
        argument fell through every comparison to zero, and a negative zero
        numerator on the negative real axis satisfied `y >= 0` and gave +pi
        where -pi is required. Complex.phase is built on this.
    #/
    frame atan2(y: float, x: float) ret float {
        return atan2(y, x);
    }

    # Logarithmic functions
    frame log10(x: float) ret float {
        return log(x) / LN10;
    }

    frame log2(x: float) ret float {
        return log(x) / LN2;
    }

    # Utility functions
    frame clamp(x: float, minVal: float, maxVal: float) ret float {
        if (x < minVal) 
            return minVal;
        if (x > maxVal) 
            return maxVal;
        return x;
    }

    frame clamp(x: int, minVal: int, maxVal: int) ret int {
        if (x < minVal) 
            return minVal;
        if (x > maxVal) 
            return maxVal;
        return x;
    }

    /#
        Linear interpolation. Weighting each endpoint separately keeps the
        difference `b - a` from overflowing when the endpoints have opposite
        signs near the limit; the endpoints themselves are returned exactly.
    #/
    frame lerp(a: float, b: float, t: float) ret float {
        if (t == 0.0) {
            return a;
        }
        if (t == 1.0) {
            return b;
        }
        return (a * (1.0 - t)) + (b * t);
    }

    frame sign(x: float) ret float {
        if (x > 0.0) 
            return 1.0;
        if (x < 0.0) 
            return -1.0;
        return 0.0;
    }

    frame sign(x: int) ret int {
        if (x > 0) 
            return 1;
        if (x < 0) 
            return -1;
        return 0;
    }

    /#
        Floor modulo: the result takes the sign of the divisor.

        Forming the quotient first overflows for a large dividend and a small
        divisor, as with 1e308 and 1e-308, and the remainder then came back
        infinite. The platform remainder never materializes the quotient; its
        result truncates toward zero, so one divisor is added back when the
        signs differ.
    #/
    frame mod(x: float, y: float) ret float {
        local remainder: float = fmod(x, y);
        if (remainder == 0.0) {
            return remainder;
        }
        if ((remainder < 0.0) != (y < 0.0)) {
            return remainder + y;
        }
        return remainder;
    }

    frame degToRad(deg: float) ret float {
        return deg * (PI / 180.0);
    }

    frame radToDeg(rad: float) ret float {
        return rad * (180.0 / PI);
    }

    frame isPowerOfTwo(x: int) ret bool {
        return (x > 0) && ((x & (x - 1)) == 0);
    }

    frame nextPowerOfTwo(x: int) ret int {
        local n: int = x - 1;
        n = n | (n >> 1);
        n = n | (n >> 2);
        n = n | (n >> 4);
        n = n | (n >> 8);
        n = n | (n >> 16);
        return n + 1;
    }

    /#
        Greatest common divisor. The magnitudes are taken in long: the
        magnitude of the minimum int is not an int, and taking it there left a
        negative value that produced a negative divisor.
    #/
    frame gcd(a: int, b: int) ret int {
        local x: long = cast<long>(a);
        local y: long = cast<long>(b);
        if (x < cast<long>(0)) {
            x = -x;
        }
        if (y < cast<long>(0)) {
            y = -y;
        }
        loop (y != cast<long>(0)) {
            local temp: long = y;
            y = x % y;
            x = temp;
        }
        return cast<int>(x);
    }

    /#
        Least common multiple. The common factor is divided out before
        multiplying: forming the product first overflows whenever the two
        share a large factor, so lcm(50000, 50000) did not return 50000.
    #/
    frame lcm(a: int, b: int) ret int {
        if ((a == 0) || (b == 0)) {
            return 0;
        }
        local common: long = cast<long>(Math.gcd(a, b));
        local x: long = cast<long>(a);
        local y: long = cast<long>(b);
        if (x < cast<long>(0)) {
            x = -x;
        }
        if (y < cast<long>(0)) {
            y = -y;
        }
        return cast<int>((x / common) * y);
    }

    frame factorial(n: int) ret long {
        if (n <= 1) 
            return cast<long>(1);
        local result: long = 1;
        local i: int = 2;
        loop (i <= n) {
            result = result * cast<long>(i);
            i = i + 1;
        }
        return result;
    }

    frame fibonacci(n: int) ret long {
        if (n <= 0) 
            return cast<long>(0);
        if (n == 1) 
            return cast<long>(1);
        local a: long = 0;
        local b: long = 1;
        local i: int = 2;
        loop (i <= n) {
            local temp: long = a + b;
            a = b;
            b = temp;
            i = i + 1;
        }
        return b;
    }

    frame isEven(x: int) ret bool {
        return (x & 1) == 0;
    }

    frame isOdd(x: int) ret bool {
        return (x & 1) == 1;
    }
}
