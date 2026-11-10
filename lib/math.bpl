# Math helpers

import sqrt, sin, cos, pow, exp, log, floor, ceil, round, fabs, minnum, maxnum, copysign, fma from "./intrinsics.bpl";
import [Array] from "./array.bpl";

# Arc tangent has no LLVM intrinsic mapping here, so it comes from the
# platform math library, as the accuracy note on Math.atan explains.
extern atan(x: float) ret float;
extern atan2(y: float, x: float) ret float;
extern fmod(x: float, y: float) ret float;
extern log10(x: float) ret float;
extern log2(x: float) ret float;

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
        if (x == -2147483648) {
            throw "Math.abs result exceeds int";
        }
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
        if ((x > 1.0) || (x < -1.0)) {
            return sqrt(-1.0);
        }
        # Factoring avoids cancellation near either endpoint. atan2 handles
        # the endpoints directly and preserves a negative-zero input.
        return Math.atan2(x, sqrt((1.0 - x) * (1.0 + x)));
    }

    frame acos(x: float) ret float {
        if ((x > 1.0) || (x < -1.0)) {
            return sqrt(-1.0);
        }
        # Avoid subtracting nearly equal angles when x is close to +1.
        return Math.atan2(sqrt((1.0 - x) * (1.0 + x)), x);
    }

    /#
        Arc tangent, from the platform math library.

        This was a four-term Taylor series with the reciprocal identity above
        one. That series is about 0.0616 radians, or 3.5 degrees, wrong at
        x = 1, and switching to the identity just past one reversed the sign of
        that error, so the result jumped by roughly 0.123 radians across an
        input change of 1e-12. Former asin, acos, atan2, and complex-phase
        implementations depended on this helper and inherited those errors.
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
        return log10(x);
    }

    frame log2(x: float) ret float {
        return log2(x);
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
        # Identical endpoints interpolate to themselves at any position.
        # Weighting them separately would halve each one, and halving is not
        # exact for subnormals, so both halves would round to zero.
        if (a == b) {
            return a;
        }
        local span: float = b - a;
        if (Math.isInfinite(span)) {
            # The endpoints are too far apart to subtract, so weight them
            # instead. This is the only case where that is needed.
            return (a * (1.0 - t)) + (b * t);
        }
        return a + (span * t);
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
            # A zero remainder takes the sign of the divisor under this
            # convention; the platform remainder gives it the sign of the
            # dividend instead. Copy the sign directly: zero times an
            # infinite divisor would produce NaN.
            return Math.copysign(0.0, y);
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
        if (x <= 1) {
            return 1;
        }
        # 2^30 is the largest positive power of two in a signed int.
        if (x > 1073741824) {
            throw "Math.nextPowerOfTwo result exceeds int";
        }
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
        negative value that produced a negative divisor. The result is a long
        for the same reason: the greatest common divisor of the minimum int
        with itself is 2147483648, which an int cannot hold.
    #/
    frame gcd(a: int, b: int) ret long {
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
        return x;
    }

    /#
        Least common multiple. The common factor is divided out before
        multiplying: forming the product first overflows whenever the two
        share a large factor, so lcm(50000, 50000) did not return 50000. The
        result is a long because the multiple of two coprime ints does not fit
        an int.
    #/
    frame lcm(a: int, b: int) ret long {
        if ((a == 0) || (b == 0)) {
            return cast<long>(0);
        }
        local common: long = Math.gcd(a, b);
        local x: long = cast<long>(a);
        local y: long = cast<long>(b);
        if (x < cast<long>(0)) {
            x = -x;
        }
        if (y < cast<long>(0)) {
            y = -y;
        }
        return (x / common) * y;
    }

    frame factorial(n: int) ret long {
        # 20! is the last factorial representable by a signed 64-bit long.
        if (n > 20) {
            throw "Math.factorial result exceeds long";
        }
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
        # F(92) fits; F(93) does not. Check before entering the loop so very
        # large indices cannot wrap either the result or the int loop counter.
        if (n > 92) {
            throw "Math.fibonacci result exceeds long";
        }
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
    # ------------------------------------------------------------------
    # Rounding and classification

    # True for a value that is neither NaN nor infinite.
    frame isFinite(x: float) ret bool {
        return !Math.isNan(x) && !Math.isInfinite(x);
    }

    # Rounds toward zero.
    frame trunc(x: float) ret float {
        if (x < 0.0) {
            return ceil(x);
        }
        return floor(x);
    }

    # The fractional part, with the sign of x (x - trunc(x)).
    frame fract(x: float) ret float {
        return x - Math.trunc(x);
    }

    # Fused multiply-add a * b + c with a single rounding.
    frame fma(a: float, b: float, c: float) ret float {
        return fma(a, b, c);
    }

    # Whether a and b differ by at most max(relTol * max(|a|, |b|), absTol).
    frame approxEqual(a: float, b: float, relTol: float, absTol: float) ret bool {
        if (a == b) {
            return true;
        }
        local difference: float = fabs(a - b);
        local scale: float = fabs(a);
        if (fabs(b) > scale) {
            scale = fabs(b);
        }
        return (difference <= (relTol * scale)) || (difference <= absTol);
    }

    # ------------------------------------------------------------------
    # Powers, roots and logarithms

    # Cube root, defined for negative values.
    frame cbrt(x: float) ret float {
        if ((x == 0.0) || !Math.isFinite(x)) {
            return x;
        }
        local magnitude: float = fabs(x);
        local y: float = pow(magnitude, 1.0 / 3.0);
        # One Newton step fixes the last bits of pow's estimate.
        y = y - (((y * y * y) - magnitude) / (3.0 * y * y));
        return copysign(y, x);
    }

    # sqrt(x*x + y*y) without intermediate overflow or underflow.
    frame hypot(x: float, y: float) ret float {
        local a: float = fabs(x);
        local b: float = fabs(y);
        if (Math.isInfinite(a) || Math.isInfinite(b)) {
            return 1.0 / 0.0;
        }
        if (b > a) {
            local swap: float = a;
            a = b;
            b = swap;
        }
        if (a == 0.0) {
            return 0.0;
        }
        local ratio: float = b / a;
        return a * sqrt(1.0 + (ratio * ratio));
    }

    frame exp2(x: float) ret float {
        return pow(2.0, x);
    }

    # e^x - 1, accurate for small x.
    frame expm1(x: float) ret float {
        if (fabs(x) < 0.00001) {
            return x + ((x * x) / 2.0) + ((x * x * x) / 6.0);
        }
        return exp(x) - 1.0;
    }

    # ln(1 + x), accurate for small x.
    frame log1p(x: float) ret float {
        local u: float = 1.0 + x;
        if (u == 1.0) {
            return x;
        }
        # Corrects the rounding error of 1 + x (Goldberg's method).
        return (log(u) * x) / (u - 1.0);
    }

    # Logarithm of x in an arbitrary base.
    frame logBase(x: float, base: float) ret float {
        return log(x) / log(base);
    }

    # x raised to an integer power by repeated squaring.
    frame powInt(x: float, n: int) ret float {
        local exponent: long = cast<long>(n);
        local negative: bool = exponent < cast<long>(0);
        if (negative) {
            exponent = -exponent;
        }
        local result: float = 1.0;
        local base: float = x;
        loop (exponent > cast<long>(0)) {
            if ((exponent & cast<long>(1)) == cast<long>(1)) {
                result = result * base;
            }
            base = base * base;
            exponent = exponent >> cast<long>(1);
        }
        if (negative) {
            return 1.0 / result;
        }
        return result;
    }

    # ------------------------------------------------------------------
    # Hyperbolic functions

    frame sinh(x: float) ret float {
        if (fabs(x) < 0.00001) {
            return x + ((x * x * x) / 6.0);
        }
        return (exp(x) - exp(-x)) / 2.0;
    }

    frame cosh(x: float) ret float {
        return (exp(x) + exp(-x)) / 2.0;
    }

    frame tanh(x: float) ret float {
        if (x > 20.0) {
            return 1.0;
        }
        if (x < -20.0) {
            return -1.0;
        }
        if (fabs(x) < 0.00001) {
            return x - ((x * x * x) / 3.0);
        }
        local e2: float = exp(2.0 * x);
        return (e2 - 1.0) / (e2 + 1.0);
    }

    frame asinh(x: float) ret float {
        local a: float = fabs(x);
        local result: float = log(a + sqrt((a * a) + 1.0));
        if (a < 0.0001) {
            result = a - ((a * a * a) / 6.0);
        }
        return copysign(result, x);
    }

    # Inverse hyperbolic cosine; NaN below 1.
    frame acosh(x: float) ret float {
        if (x < 1.0) {
            return 0.0 / 0.0;
        }
        return log(x + sqrt((x * x) - 1.0));
    }

    # Inverse hyperbolic tangent; NaN outside [-1, 1], infinite at +-1.
    frame atanh(x: float) ret float {
        if ((x > 1.0) || (x < -1.0)) {
            return 0.0 / 0.0;
        }
        return 0.5 * Math.log1p((2.0 * x) / (1.0 - x));
    }

    # ------------------------------------------------------------------
    # Special functions

    # Error function (Abramowitz and Stegun 7.1.26, error below 1.5e-7).
    frame erf(x: float) ret float {
        local t: float = 1.0 / (1.0 + (0.3275911 * fabs(x)));
        local polynomial: float = t * (0.254829592 + (t * (-0.284496736 + (t * (1.421413741 + (t * (-1.453152027 + (t * 1.061405429))))))));
        local result: float = 1.0 - (polynomial * exp(-(x * x)));
        return copysign(result, x);
    }

    frame erfc(x: float) ret float {
        return 1.0 - Math.erf(x);
    }

    # ln|Gamma(x)| by the Lanczos approximation (g = 7, about 15 digits).
    frame lgamma(x: float) ret float {
        if (x < 0.5) {
            # Reflection: Gamma(x) Gamma(1 - x) = pi / sin(pi x).
            return log(3.14159265358979323846 / fabs(sin(3.14159265358979323846 * x))) - Math.lgamma(1.0 - x);
        }
        local coefficients: float[9] = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 0.0000099843695780195716, 0.00000015056327351493116];
        local z: float = x - 1.0;
        local sum: float = coefficients[0];
        loop (local i: int = 1; i < 9; i = i + 1) {
            sum = sum + (coefficients[i] / (z + cast<float>(i)));
        }
        local t: float = z + 7.5;
        return ((0.91893853320467274178 + ((z + 0.5) * log(t))) - t) + log(sum);
    }

    # The gamma function (factorial for positive integers: Gamma(n) = (n-1)!).
    frame tgamma(x: float) ret float {
        if ((x <= 0.0) && (x == floor(x))) {
            return 0.0 / 0.0;
        }
        if (x < 0.5) {
            return 3.14159265358979323846 / (sin(3.14159265358979323846 * x) * Math.tgamma(1.0 - x));
        }
        return exp(Math.lgamma(x));
    }

    # ------------------------------------------------------------------
    # Interpolation and ranges

    # Hermite interpolation from 0 to 1 as x moves from edge0 to edge1.
    frame smoothstep(edge0: float, edge1: float, x: float) ret float {
        if (edge0 == edge1) {
            if (x < edge0) {
                return 0.0;
            }
            return 1.0;
        }
        local t: float = Math.clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
        return t * t * (3.0 - (2.0 * t));
    }

    # The position of x between a and b as a fraction (inverse of lerp).
    frame inverseLerp(a: float, b: float, x: float) ret float {
        if (a == b) {
            return 0.0;
        }
        return (x - a) / (b - a);
    }

    # Maps x from [inMin, inMax] to [outMin, outMax] (not clamped).
    frame remap(x: float, inMin: float, inMax: float, outMin: float, outMax: float) ret float {
        return Math.lerp(outMin, outMax, Math.inverseLerp(inMin, inMax, x));
    }

    # Wraps an angle in radians into [-pi, pi).
    frame wrapAngle(radians: float) ret float {
        local tau: float = 6.28318530717958647692;
        local wrapped: float = radians - (tau * floor((radians + 3.14159265358979323846) / tau));
        return wrapped;
    }

    # ------------------------------------------------------------------
    # Integer number theory (64-bit)

    frame gcdLong(a: long, b: long) ret long {
        local x: ulong = Math._magnitude(a);
        local y: ulong = Math._magnitude(b);
        loop (y != cast<ulong>(0)) {
            local temp: ulong = y;
            y = x % y;
            x = temp;
        }
        if (x > cast<ulong>(9223372036854775807)) {
            throw "Math.gcdLong result exceeds long";
        }
        return cast<long>(x);
    }

    # Least common multiple; throws when it does not fit a long.
    frame lcmLong(a: long, b: long) ret long {
        if ((a == cast<long>(0)) || (b == cast<long>(0))) {
            return 0;
        }
        local common: ulong = cast<ulong>(Math.gcdLong(a, b));
        local x: ulong = Math._magnitude(a) / common;
        local y: ulong = Math._magnitude(b);
        if (x > (cast<ulong>(9223372036854775807) / y)) {
            throw "Math.lcmLong result exceeds long";
        }
        return cast<long>(x * y);
    }

    frame _magnitude(value: long) ret ulong {
        if (value < cast<long>(0)) {
            return cast<ulong>(0) - cast<ulong>(value);
        }
        return cast<ulong>(value);
    }

    # (a * b) mod m without overflow, for m > 0.
    frame mulMod(a: ulong, b: ulong, m: ulong) ret ulong {
        if (m == cast<ulong>(0)) {
            throw "Math.mulMod modulus must be positive";
        }
        local x: ulong = a % m;
        local y: ulong = b % m;
        if ((x < cast<ulong>(4294967296)) && (y < cast<ulong>(4294967296))) {
            return (x * y) % m;
        }
        local result: ulong = 0;
        loop (y > cast<ulong>(0)) {
            if ((y & cast<ulong>(1)) == cast<ulong>(1)) {
                # result + x may exceed 2^64; subtract instead of adding past m.
                if (result >= (m - x)) {
                    result = result - (m - x);
                } else {
                    result = result + x;
                }
            }
            if (x >= (m - x)) {
                x = x - (m - x);
            } else {
                x = x + x;
            }
            y = y >> cast<ulong>(1);
        }
        return result;
    }

    # base^exponent mod m by square-and-multiply, for m > 0.
    frame powMod(base: ulong, exponent: ulong, m: ulong) ret ulong {
        if (m == cast<ulong>(0)) {
            throw "Math.powMod modulus must be positive";
        }
        local result: ulong = cast<ulong>(1) % m;
        local b: ulong = base % m;
        local e: ulong = exponent;
        loop (e > cast<ulong>(0)) {
            if ((e & cast<ulong>(1)) == cast<ulong>(1)) {
                result = Math.mulMod(result, b, m);
            }
            b = Math.mulMod(b, b, m);
            e = e >> cast<ulong>(1);
        }
        return result;
    }

    # The modular inverse of a mod m (m > 1), or -1 when gcd(a, m) != 1.
    frame modInverse(a: long, m: long) ret long {
        if (m <= cast<long>(1)) {
            return -1;
        }
        local oldR: long = a % m;
        if (oldR < cast<long>(0)) {
            oldR = oldR + m;
        }
        local r: long = m;
        local oldS: long = 1;
        local s: long = 0;
        loop (r != cast<long>(0)) {
            local quotient: long = oldR / r;
            local nextR: long = oldR - (quotient * r);
            oldR = r;
            r = nextR;
            local nextS: long = oldS - (quotient * s);
            oldS = s;
            s = nextS;
        }
        if (oldR != cast<long>(1)) {
            return -1;
        }
        local inverse: long = oldS % m;
        if (inverse < cast<long>(0)) {
            inverse = inverse + m;
        }
        return inverse;
    }

    # floor(sqrt(n)) for n >= 0, exact for every long.
    frame isqrt(n: long) ret long {
        if (n < cast<long>(0)) {
            throw "Math.isqrt requires a non-negative value";
        }
        if (n < cast<long>(2)) {
            return n;
        }
        local x: long = cast<long>(sqrt(cast<float>(n)));
        # Correct the floating-point estimate in both directions.
        loop ((x > cast<long>(0)) && (x > (n / x))) {
            x = x - 1;
        }
        loop ((x + 1) <= (n / (x + 1))) {
            x = x + 1;
        }
        return x;
    }

    # Deterministic primality for every non-negative long (Miller-Rabin
    # with the first twelve prime bases).
    frame isPrime(n: long) ret bool {
        if (n < cast<long>(2)) {
            return false;
        }
        local small: long[12] = [cast<long>(2), cast<long>(3), cast<long>(5), cast<long>(7), cast<long>(11), cast<long>(13), cast<long>(17), cast<long>(19), cast<long>(23), cast<long>(29), cast<long>(31), cast<long>(37)];
        loop (local i: int = 0; i < 12; i = i + 1) {
            if (n == small[i]) {
                return true;
            }
            if ((n % small[i]) == cast<long>(0)) {
                return false;
            }
        }
        local value: ulong = cast<ulong>(n);
        local d: ulong = value - cast<ulong>(1);
        local r: int = 0;
        loop ((d & cast<ulong>(1)) == cast<ulong>(0)) {
            d = d >> cast<ulong>(1);
            r = r + 1;
        }
        loop (local i: int = 0; i < 12; i = i + 1) {
            local x: ulong = Math.powMod(cast<ulong>(small[i]), d, value);
            if ((x == cast<ulong>(1)) || (x == (value - cast<ulong>(1)))) {
                continue;
            }
            local composite: bool = true;
            loop (local j: int = 1; j < r; j = j + 1) {
                x = Math.mulMod(x, x, value);
                if (x == (value - cast<ulong>(1))) {
                    composite = false;
                    break;
                }
            }
            if (composite) {
                return false;
            }
        }
        return true;
    }

    # Primes up to and including `limit` (sieve of Eratosthenes).
    frame primesUpTo(limit: int) ret Array<int> {
        local primes: Array<int> = Array<int>.new(16);
        if (limit < 2) {
            return primes;
        }
        local composite: Array<bool> = Array<bool>.new(limit + 1);
        loop (local i: int = 0; i <= limit; i = i + 1) {
            composite.push(false);
        }
        loop (local i: int = 2; i <= limit; i = i + 1) {
            if (composite.data[i]) {
                continue;
            }
            primes.push(i);
            local start: long = cast<long>(i) * cast<long>(i);
            loop (local j: long = start; j <= cast<long>(limit); j = j + cast<long>(i)) {
                composite.data[cast<int>(j)] = true;
            }
        }
        composite.destroy();
        return primes;
    }

    # The binomial coefficient C(n, k); throws when it does not fit a long.
    frame binomial(n: int, k: int) ret long {
        if ((k < 0) || (n < 0) || (k > n)) {
            return 0;
        }
        if (k > (n - k)) {
            k = n - k;
        }
        local result: long = 1;
        loop (local i: int = 1; i <= k; i = i + 1) {
            # result * (n - k + i) / i is exact; divide by the common factor
            # first to delay overflow.
            local numerator: long = cast<long>((n - k) + i);
            local g: long = Math.gcdLong(result, cast<long>(i));
            local reducedResult: long = result / g;
            local divisor: long = cast<long>(i) / g;
            local reducedNumerator: long = numerator / divisor;
            if ((reducedResult > cast<long>(0)) && (reducedNumerator > (cast<long>(9223372036854775807) / reducedResult))) {
                throw "Math.binomial result exceeds long";
            }
            result = reducedResult * reducedNumerator;
        }
        return result;
    }

    # Integer division rounding toward negative infinity.
    frame floorDiv(a: long, b: long) ret long {
        if (b == cast<long>(0)) {
            throw "Math.floorDiv by zero";
        }
        local quotient: long = a / b;
        if (((a % b) != cast<long>(0)) && ((a < cast<long>(0)) != (b < cast<long>(0)))) {
            quotient = quotient - 1;
        }
        return quotient;
    }

    # The remainder with the sign of the divisor (a - b * floorDiv(a, b)).
    frame floorMod(a: long, b: long) ret long {
        if (b == cast<long>(0)) {
            throw "Math.floorMod by zero";
        }
        local remainder: long = a % b;
        if ((remainder != cast<long>(0)) && ((remainder < cast<long>(0)) != (b < cast<long>(0)))) {
            remainder = remainder + b;
        }
        return remainder;
    }

    # Clamp for longs.
    frame clampLong(x: long, minVal: long, maxVal: long) ret long {
        if (x < minVal) {
            return minVal;
        }
        if (x > maxVal) {
            return maxVal;
        }
        return x;
    }

    # Adds without wrapping; throws on overflow.
    frame checkedAdd(a: long, b: long) ret long {
        if ((b > cast<long>(0)) && (a > (cast<long>(9223372036854775807) - b))) {
            throw "Math.checkedAdd overflow";
        }
        if ((b < cast<long>(0)) && (a < ((cast<long>(-9223372036854775807) - 1) - b))) {
            throw "Math.checkedAdd overflow";
        }
        return a + b;
    }

    # Multiplies without wrapping; throws on overflow.
    frame checkedMul(a: long, b: long) ret long {
        if ((a == cast<long>(0)) || (b == cast<long>(0))) {
            return 0;
        }
        local minimum: long = cast<long>(-9223372036854775807) - 1;
        # Dividing the minimum by -1 traps, so those cases are decided first.
        if (((a == cast<long>(-1)) && (b == minimum)) || ((b == cast<long>(-1)) && (a == minimum))) {
            throw "Math.checkedMul overflow";
        }
        local product: long = a * b;
        if ((product / b) != a) {
            throw "Math.checkedMul overflow";
        }
        return product;
    }

    # Adds, clamping at the long limits instead of wrapping.
    frame saturatingAdd(a: long, b: long) ret long {
        if ((b > cast<long>(0)) && (a > (cast<long>(9223372036854775807) - b))) {
            return 9223372036854775807;
        }
        if ((b < cast<long>(0)) && (a < ((cast<long>(-9223372036854775807) - 1) - b))) {
            return cast<long>(-9223372036854775807) - 1;
        }
        return a + b;
    }

    # The number of decimal digits of |n| (1 for 0).
    frame digitCount(n: long) ret int {
        local value: ulong = Math._magnitude(n);
        local digits: int = 1;
        loop (value >= cast<ulong>(10)) {
            value = value / cast<ulong>(10);
            digits = digits + 1;
        }
        return digits;
    }
}
