import { it } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

// Reference values come from Python's math module (erf differs from it by
// the documented 1.5e-7 bound of the Abramowitz-Stegun approximation).

it("computes rounding, roots, hyperbolic, special and number-theory functions", () => {
  expectCorrectnessSuite([
    {
      name: "math extras",
      validateLlvm: true,
      expectedStdout:
        "round -2.0 2.0 -0.75 7.00 F T\nroots -3.0000000000 1.2599210499 1.41421e+300 5.0000000000\nexp 1024.0000000000 1.000000e-10 1.000000e-10 3.0000000000 0.1250000000\nhyper 1.1752011936 1.5430806348 0.4621171573 -1.4436354752 1.3169578969 0.5493061443\nspecial 0.5205000 -0.9103140 2.453736571 1.772453851 362880 0.5723649429\ninterp 0.1562 0.5000 150.0000 0.7168\ngcd 12 42 5\nmod 114944269 976371285 0 4 -1\nisqrt 0 9 3037000499 1000000\nprime T F T T F\nsieve 10 2 29\nbinomial 10 118264581564861424 7219428434016265740 0\nfloor -4 1 -1 3\nchecked 3 9223372036854775807 -12 1 19\nMath.checkedMul overflow\nMath.checkedAdd overflow\nMath.binomial result exceeds long\n",
      source: `import [Math] from "std/math.bpl";
import [Array] from "std/array.bpl";
extern printf(fmt: string, ...);
frame b(v: bool) ret string { if (v) { return "T"; } return "F"; }
frame main() ret int {
    printf("round %.1f %.1f %.2f %.2f %s %s\\n", Math.trunc(-2.7), Math.trunc(2.7), Math.fract(-2.75), Math.fma(2.0, 3.0, 1.0), b(Math.isFinite(1.0 / 0.0)), b(Math.approxEqual(1.0, 1.0000000001, 0.000000001, 0.0)));
    printf("roots %.10f %.10f %.6g %.10f\\n", Math.cbrt(-27.0), Math.cbrt(2.0), Math.hypot(Math.powInt(10.0, 300), Math.powInt(10.0, 300)), Math.hypot(3.0, 4.0));
    printf("exp %.10f %.6e %.6e %.10f %.10f\\n", Math.exp2(10.0), Math.expm1(0.0000000001), Math.log1p(0.0000000001), Math.logBase(8.0, 2.0), Math.powInt(2.0, -3));
    printf("hyper %.10f %.10f %.10f %.10f %.10f %.10f\\n", Math.sinh(1.0), Math.cosh(1.0), Math.tanh(0.5), Math.asinh(-2.0), Math.acosh(2.0), Math.atanh(0.5));
    printf("special %.7f %.7f %.10g %.10g %.10g %.10g\\n", Math.erf(0.5), Math.erf(-1.2), Math.lgamma(4.5), Math.tgamma(0.5), Math.tgamma(10.0), Math.lgamma(0.5));
    printf("interp %.4f %.4f %.4f %.4f\\n", Math.smoothstep(0.0, 1.0, 0.25), Math.inverseLerp(10.0, 20.0, 15.0), Math.remap(5.0, 0.0, 10.0, 100.0, 200.0), Math.wrapAngle(7.0));
    printf("gcd %ld %ld %ld\\n", Math.gcdLong(cast<long>(-48), cast<long>(180)), Math.lcmLong(cast<long>(21), cast<long>(6)), Math.gcdLong(cast<long>(0), cast<long>(5)));
    printf("mod %lu %lu %lu %ld %ld\\n", Math.mulMod(cast<ulong>(0xFFFFFFFFFFFFFFFF), cast<ulong>(0xFFFFFFFFFFFFFFFF), cast<ulong>(1000000007)), Math.powMod(cast<ulong>(2), cast<ulong>(100), cast<ulong>(1000000007)), Math.powMod(cast<ulong>(3), cast<ulong>(0), cast<ulong>(1)), Math.modInverse(cast<long>(3), cast<long>(11)), Math.modInverse(cast<long>(4), cast<long>(8)));
    printf("isqrt %ld %ld %ld %ld\\n", Math.isqrt(cast<long>(0)), Math.isqrt(cast<long>(99)), Math.isqrt(cast<long>(9223372036854775807)), Math.isqrt(cast<long>(1000000000000)));
    printf("prime %s %s %s %s %s\\n", b(Math.isPrime(cast<long>(2))), b(Math.isPrime(cast<long>(561))), b(Math.isPrime(cast<long>(1000000007))), b(Math.isPrime(cast<long>(9223372036854775783))), b(Math.isPrime(cast<long>(3215031751))));
    local primes: Array<int> = Math.primesUpTo(30);
    printf("sieve %d %d %d\\n", primes.length, primes.get(0), primes.get(primes.length - 1));
    primes.destroy();
    printf("binomial %ld %ld %ld %ld\\n", Math.binomial(5, 2), Math.binomial(60, 30), Math.binomial(66, 33), Math.binomial(3, 5));
    printf("floor %ld %ld %ld %ld\\n", Math.floorDiv(cast<long>(-7), cast<long>(2)), Math.floorMod(cast<long>(-7), cast<long>(2)), Math.floorMod(cast<long>(7), cast<long>(-2)), Math.floorDiv(cast<long>(7), cast<long>(2)));
    printf("checked %ld %ld %ld %d %d\\n", Math.checkedAdd(cast<long>(1), cast<long>(2)), Math.saturatingAdd(cast<long>(9223372036854775807), cast<long>(5)), Math.checkedMul(cast<long>(-3), cast<long>(4)), Math.digitCount(cast<long>(0)), Math.digitCount(cast<long>(-9223372036854775807) - 1));
    try { Math.checkedMul(cast<long>(-1), cast<long>(-9223372036854775807) - 1); } catch (m: string) { printf("%s\\n", m); }
    try { Math.checkedAdd(cast<long>(9223372036854775807), cast<long>(1)); } catch (m: string) { printf("%s\\n", m); }
    try { Math.binomial(70, 35); } catch (m: string) { printf("%s\\n", m); }
    return 0;
}
`,
    },
  ]);
}, 120000);
