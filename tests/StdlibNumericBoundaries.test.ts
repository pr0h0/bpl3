import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

// Each case has a representable answer that an intermediate value destroyed:
// a sum, a difference, a cross product, a negation, or a square.

test("integer median widens before adding its middle values", () => {
  expectCorrectnessSuite([
    {
      name: "stats-median-boundaries",
      validateLlvm: true,
      source: `
      import [Stats] from "std/stats.bpl";
      import printf from "std/c.bpl";
      frame main() ret int {
        local high: int[2] = [2147483647, 2147483647];
        local low: int[2] = [cast<int>(-2147483648), cast<int>(-2147483648)];
        local ordinary: int[2] = [2, 4];
        printf("%.1f %.1f %.1f\\n",
          Stats.median(&high[0], 2),
          Stats.median(&low[0], 2),
          Stats.median(&ordinary[0], 2));
        return 0;
      }`,
      expectedStdout: "2147483647.0 -2147483648.0 3.0\n",
    },
  ]);
}, 60000);

test("range length, membership, and inclusive ends hold at the signed limits", () => {
  expectCorrectnessSuite([
    {
      name: "range-boundaries",
      validateLlvm: true,
      source: `
      import [Range] from "std/range.bpl";
      import printf from "std/c.bpl";
      frame main() ret int {
        # The span of each range exceeds int even though its length does not.
        local wide: Range = Range.new(-2000000000, 2000000000, 2000000000);
        local full: Range = Range.new(-2147483648, 2147483647, 3);
        # An inclusive end at the maximum int has no exclusive end in int.
        local topped: Range = Range.betweenInclusive(2147483646, 2147483647);
        local ordinary: Range = Range.new(0, 10, 3);
        local descending: Range = Range.new(2147483647, -2147483648, -3);
        printf("%d %d %d %d %d %d\\n",
          wide.len(), full.len(), cast<int>(full.contains(1)),
          topped.len(), ordinary.len(), descending.len());
        return 0;
      }`,
      expectedStdout: "2 1431655765 1 2 4 1431655765\n",
    },
  ]);
}, 60000);

test("rational comparison and rounding avoid overflowing intermediates", () => {
  expectCorrectnessSuite([
    {
      name: "rational-order-round",
      validateLlvm: true,
      source: `
      import [Rational] from "std/rational.bpl";
      import printf from "std/c.bpl";
      frame main() ret int {
        local large: Rational = Rational.fromLong(4611686018427387904);
        local half: Rational = Rational.new(1, 2);
        local ordinary: Rational = Rational.new(7, 2);
        local negative: Rational = Rational.new(-7, 2);
        local third: Rational = Rational.new(1, 3);
        local quarter: Rational = Rational.new(1, 4);
        printf("%d %ld %ld %ld %d %d %d\\n",
          large.compare(&half),
          large.round(),
          ordinary.round(),
          negative.round(),
          third.compare(&quarter),
          quarter.compare(&third),
          third.compare(&third));
        return 0;
      }`,
      expectedStdout: "1 4611686018427387904 4 -3 1 -1 0\n",
    },
  ]);
}, 60000);

test("complex power and magnitude survive extreme operands", () => {
  expectCorrectnessSuite([
    {
      name: "complex-boundaries",
      validateLlvm: true,
      source: `
      import [Complex] from "std/complex.bpl";
      import printf from "std/c.bpl";
      frame main() ret int {
        local two: Complex = Complex.fromReal(2.0);
        # Negating the minimum int leaves it negative, which skipped the loop.
        local extreme: Complex = two.pow(cast<int>(-2147483648));
        local control: Complex = two.pow(-2);

        local scale: float = 10.0;
        loop (local i: int = 1; i < 200; i = i + 1) { scale = scale * 10.0; }
        # Squaring either component overflows or underflows on its own.
        local large: Complex = Complex.new(3.0 * scale, 4.0 * scale);
        local small: Complex = Complex.new(3.0 / scale, 4.0 / scale);
        local plain: Complex = Complex.new(3.0, 4.0);
        local zero: Complex = Complex.new(0.0, 0.0);

        printf("%.2f %.2f %.1e %.1e %.1f %.1f\\n",
          extreme.real, control.real,
          large.abs(), small.abs(), plain.abs(), zero.abs());
        return 0;
      }`,
      expectedStdout: "0.00 0.25 5.0e+200 5.0e-200 5.0 0.0\n",
    },
  ]);
}, 60000);

test("complex magnitude classifies non-finite components", () => {
  expectCorrectnessSuite([
    {
      name: "complex-nonfinite-magnitude",
      validateLlvm: true,
      source: `
      import [Complex] from "std/complex.bpl";
      import printf from "std/c.bpl";
      extern atof(text: string) ret float;
      frame main() ret int {
        local infinity: float = atof("inf");
        local notANumber: float = atof("nan");
        # An infinite component wins over anything, including NaN; a NaN
        # component otherwise makes the magnitude NaN, even beside a zero.
        local bothInfinite: Complex = Complex.new(infinity, infinity);
        local infiniteReal: Complex = Complex.new(infinity, 1.0);
        local infiniteBesideNaN: Complex = Complex.new(infinity, notANumber);
        local imaginaryNaN: Complex = Complex.new(0.0, notANumber);
        local realNaN: Complex = Complex.new(notANumber, 0.0);
        local finite: Complex = Complex.new(3.0, 4.0);
        printf("%d %d %d %d %d %.1f\\n",
          cast<int>(bothInfinite.abs() == infinity),
          cast<int>(infiniteReal.abs() == infinity),
          cast<int>(infiniteBesideNaN.abs() == infinity),
          cast<int>(imaginaryNaN.abs() != imaginaryNaN.abs()),
          cast<int>(realNaN.abs() != realNaN.abs()),
          finite.abs());
        return 0;
      }`,
      expectedStdout: "1 1 1 1 1 5.0\n",
    },
  ]);
}, 60000);

test("complex division and reciprocal keep finite results", () => {
  expectCorrectnessSuite([
    {
      name: "complex-division-scaling",
      validateLlvm: true,
      source: `
      import [Complex] from "std/complex.bpl";
      import printf from "std/c.bpl";
      extern atof(text: string) ret float;
      frame main() ret int {
        local large: Complex = Complex.new(atof("3e200"), atof("4e200"));
        local quotient: Complex = large.div(large);
        # 1/(3e200 + 4e200i) = (3e200 - 4e200i)/25e400.
        local inverse: Complex = large.reciprocal();
        local product: Complex = large.mul(inverse);
        local ordinary: Complex = Complex.new(3.0, 4.0);
        local control: Complex = ordinary.div(ordinary);
        local smallDivisor: Complex = Complex.new(atof("3e-200"), atof("4e-200"));
        local scaled: Complex = smallDivisor.div(smallDivisor);
        printf("%.1f %.1f %.1e %.1e %.1f %.1f %.1f %.1f\\n",
          quotient.real, quotient.imag,
          inverse.real, inverse.imag,
          product.real, control.real, control.imag, scaled.real);
        return 0;
      }`,
      expectedStdout: "1.0 0.0 1.2e-201 -1.6e-201 1.0 1.0 0.0 1.0\n",
    },
  ]);
}, 60000);

test("rational construction, comparison, and arithmetic hold at the limits", () => {
  expectCorrectnessSuite([
    {
      name: "rational-limits",
      validateLlvm: true,
      source: `
      import [Rational] from "std/rational.bpl";
      import printf from "std/c.bpl";
      frame main() ret int {
        # Reducing before normalizing the sign keeps the minimum long usable.
        local extreme: Rational = Rational.new(cast<long>(-9223372036854775808), -2);
        # Each of these has a representable answer with unrepresentable
        # intermediates if the operands are cross-multiplied.
        local half: Rational = Rational.new(9223372036854775807, 2);
        local twoThirds: Rational = Rational.new(2, 3);
        local threeHalves: Rational = Rational.new(3, 2);
        local sum: Rational = half.add(half);
        local product: Rational = half.mul(twoThirds);
        local quotient: Rational = half.div(threeHalves);
        # The invalid sentinel is ordered rather than divided by.
        local invalid: Rational = Rational.new(1, 0);
        local ordinary: Rational = Rational.new(1, 2);
        printf("%ld %ld %ld %ld %ld %ld %ld %ld %d %d %d\\n",
          extreme.num, extreme.den,
          sum.num, sum.den,
          product.num, product.den,
          quotient.num, quotient.den,
          invalid.compare(&ordinary),
          ordinary.compare(&invalid),
          invalid.compare(&invalid));
        return 0;
      }`,
      expectedStdout:
        "4611686018427387904 1 9223372036854775807 1 9223372036854775807 3 9223372036854775807 3 -1 1 0\n",
    },
  ]);
}, 60000);

test("vector lengths converge for large and ordinary magnitudes", () => {
  expectCorrectnessSuite([
    {
      name: "vector-length",
      validateLlvm: true,
      source: `
      import [Vec2] from "std/vec2.bpl";
      import [Vec3] from "std/vec3.bpl";
      import printf from "std/c.bpl";
      frame main() ret int {
        local wide2: Vec2 = Vec2.new(1000000.0, 0.0);
        local wide3: Vec3 = Vec3.new(1000000.0, 0.0, 0.0);
        local unit2: Vec2 = wide2.normalize();
        local unit3: Vec3 = wide3.normalize();
        local plain2: Vec2 = Vec2.new(3.0, 4.0);
        local plain3: Vec3 = Vec3.new(3.0, 4.0, 0.0);
        local zero2: Vec2 = Vec2.new(0.0, 0.0);
        local negative3: Vec3 = Vec3.new(-3.0, -4.0, 0.0);
        printf("%.6f %.6f %.6f %.6f %.1f %.1f %.1f %.1f\\n",
          wide2.length(), wide3.length(), unit2.x, unit3.x,
          plain2.length(), plain3.length(), zero2.length(), negative3.length());
        return 0;
      }`,
      expectedStdout:
        "1000000.000000 1000000.000000 1.000000 1.000000 5.0 5.0 0.0 5.0\n",
    },
  ]);
}, 60000);

test("float statistics stay finite for large constant samples", () => {
  expectCorrectnessSuite([
    {
      name: "float-statistics",
      validateLlvm: true,
      source: `
      import [Stats] from "std/stats.bpl";
      import printf from "std/c.bpl";
      extern atof(text: string) ret float;
      frame main() ret int {
        local large: float = atof("1e308");
        local constant: float[2] = [large, large];
        local ordinary: float[5] = [2.0, 4.0, 4.0, 4.0, 5.0];
        local pair: float[2] = [2.0, 4.0];
        printf("%.1e %.1e %.1f %.4f %.4f %.1f\\n",
          Stats.mean(&constant[0], 2),
          Stats.median(&constant[0], 2),
          Stats.variance(&constant[0], 2),
          Stats.mean(&ordinary[0], 5),
          Stats.variance(&ordinary[0], 5),
          Stats.median(&pair[0], 2));
        return 0;
      }`,
      expectedStdout: "1.0e+308 1.0e+308 0.0 3.8000 0.9600 3.0\n",
    },
  ]);
}, 60000);

test("range reversal handles the minimum step", () => {
  expectCorrectnessSuite([
    {
      name: "range-reverse-min-step",
      validateLlvm: true,
      source: `
      import [Range] from "std/range.bpl";
      import printf from "std/c.bpl";
      frame main() ret int {
        # Reversing this range needs a step of +2147483648.
        local extreme: Range = Range.new(2147483647, -2147483648, cast<int>(-2147483648));
        local reversed: Range = extreme.reverse();
        local ordinary: Range = Range.new(1, 5, 2);
        local ordinaryReversed: Range = ordinary.reverse();
        printf("%d %d %d %d %d %d %d\\n",
          extreme.len(), reversed.len(),
          cast<int>(reversed.contains(-1)),
          cast<int>(reversed.contains(2147483647)),
          reversed.get(0), ordinaryReversed.len(), ordinaryReversed.get(0));
        return 0;
      }`,
      expectedStdout: "2 2 1 1 -1 2 3\n",
    },
  ]);
}, 60000);

test("statistics sorting leaves the array ordered for every shape", () => {
  expectCorrectnessSuite([
    {
      name: "stats-sorting",
      validateLlvm: true,
      source: `
      import [Stats] from "std/stats.bpl";
      import printf from "std/c.bpl";
      frame main() ret int {
        # Duplicates, already sorted, reverse sorted, and odd and even counts.
        local mixed: int[7] = [5, 3, 9, 1, 7, 3, 8];
        local median7: float = Stats.median(&mixed[0], 7);
        local ordered: int = 1;
        loop (local i: int = 0; i < 6; i = i + 1) {
          if (mixed[i] > mixed[i + 1]) { ordered = 0; }
        }

        local sorted: float[4] = [1.0, 2.0, 3.0, 4.0];
        local reversed: float[4] = [4.0, 3.0, 2.0, 1.0];
        local single: int[1] = [42];
        local pair: int[2] = [2, 1];

        printf("%.1f %d %.1f %.1f %.1f %.1f %.1f %.1f\\n",
          median7, ordered,
          Stats.median(&sorted[0], 4), Stats.median(&reversed[0], 4),
          Stats.percentile(&reversed[0], 4, 0.0),
          Stats.percentile(&reversed[0], 4, 100.0),
          Stats.median(&single[0], 1), Stats.median(&pair[0], 2));
        return 0;
      }`,
      expectedStdout: "5.0 1 2.5 2.5 1.0 4.0 42.0 1.5\n",
    },
  ]);
}, 60000);

test("arc tangent matches the platform implementation and stays continuous", () => {
  expectCorrectnessSuite([
    {
      name: "math-atan",
      validateLlvm: true,
      source: `
      import [Math] from "std/math.bpl";
      import printf from "std/c.bpl";
      extern atan(x: float) ret float;
      extern fabs(x: float) ret float;
      frame main() ret int {
        # The old series was 0.06 radians out at one, and crossing one
        # reversed the sign of that error, so the result jumped.
        local below: float = Math.atan(1.0);
        local above: float = Math.atan(1.000000000001);
        local jump: float = fabs(above - below);
        printf("%d %d %d %.6f %.6f\\n",
          cast<int>(fabs(below - atan(1.0)) < 0.000000000001),
          cast<int>(fabs(Math.atan(0.5) - atan(0.5)) < 0.000000000001),
          cast<int>(jump < 0.000001),
          Math.atan(0.0), Math.atan2(1.0, 1.0));
        return 0;
      }`,
      expectedStdout: "1 1 1 0.000000 0.785398\n",
    },
  ]);
}, 60000);

test("statistics hold for opposite-sign extremes and subnormals", () => {
  expectCorrectnessSuite([
    {
      name: "stats-extreme-pairs",
      validateLlvm: true,
      source: `
      import [Stats] from "std/stats.bpl";
      import printf from "std/c.bpl";
      extern atof(text: string) ret float;
      frame main() ret int {
        local big: float = atof("1e308");
        local tiny: float = atof("5e-324");
        # The mean is exactly zero, but the difference between the samples is
        # not representable.
        local opposite: float[2] = [-big, big];
        # Halving each subnormal first rounds both to zero.
        local subnormal: float[2] = [tiny, tiny];
        local ordinary: float[2] = [2.0, 4.0];
        printf("%.1f %d %d %.1f %.1f\\n",
          Stats.mean(&opposite[0], 2),
          cast<int>(Stats.median(&subnormal[0], 2) == tiny),
          cast<int>(Stats.mean(&subnormal[0], 2) == tiny),
          Stats.mean(&ordinary[0], 2),
          Stats.median(&ordinary[0], 2));
        return 0;
      }`,
      expectedStdout: "0.0 1 1 3.0 3.0\n",
    },
  ]);
}, 60000);

test("rational addition reduces a sum that exceeds the signed range", () => {
  expectCorrectnessSuite([
    {
      name: "rational-large-proper-sum",
      validateLlvm: true,
      source: `
      import [Rational] from "std/rational.bpl";
      import printf from "std/c.bpl";
      frame main() ret int {
        # The numerators sum past the signed limit, while the reduced answer
        # fits: 9223372036854775805/4611686018427387903.
        local near: Rational = Rational.new(9223372036854775805, 9223372036854775806);
        local doubled: Rational = near.add(near);
        local half: Rational = Rational.new(1, 2);
        local whole: Rational = half.add(half);
        local third: Rational = Rational.new(1, 3);
        local mixed: Rational = half.add(third);
        printf("%ld %ld %ld %ld %ld %ld\\n",
          doubled.num, doubled.den, whole.num, whole.den, mixed.num, mixed.den);
        return 0;
      }`,
      expectedStdout: "9223372036854775805 4611686018427387903 1 1 5 6\n",
    },
  ]);
}, 60000);

test("complex division holds for divisors near the finite limit", () => {
  expectCorrectnessSuite([
    {
      name: "complex-near-max-division",
      validateLlvm: true,
      source: `
      import [Complex] from "std/complex.bpl";
      import printf from "std/c.bpl";
      extern atof(text: string) ret float;
      frame main() ret int {
        local big: float = atof("1e308");
        # Both components near the limit: scaling only the ratio still let the
        # denominator overflow.
        local huge: Complex = Complex.new(big, big);
        local quotient: Complex = huge.div(huge);
        local inverse: Complex = huge.reciprocal();
        local ordinary: Complex = Complex.new(3.0, 4.0);
        local control: Complex = ordinary.div(ordinary);
        printf("%.1f %.1f %.1e %.1e %.1f\\n",
          quotient.real, quotient.imag, inverse.real, inverse.imag, control.real);
        return 0;
      }`,
      expectedStdout: "1.0 0.0 5.0e-309 -5.0e-309 1.0\n",
    },
  ]);
}, 60000);

test("integer gcd and lcm keep representable answers", () => {
  expectCorrectnessSuite([
    {
      name: "integer-gcd-lcm",
      validateLlvm: true,
      source: `
      import [Math] from "std/math.bpl";
      import printf from "std/c.bpl";
      frame main() ret int {
        # The magnitude of the minimum int is not an int, and a shared large
        # factor makes the product overflow while the multiple does not.
        printf("%d %d %d %d %d %d\\n",
          Math.gcd(cast<int>(-2147483648), 6),
          Math.lcm(50000, 50000),
          Math.gcd(54, 24),
          Math.lcm(4, 6),
          Math.gcd(-54, 24),
          Math.lcm(0, 5));
        return 0;
      }`,
      expectedStdout: "2 50000 6 12 6 0\n",
    },
  ]);
}, 60000);

test("float modulo, interpolation, and atan2 stay well defined at the extremes", () => {
  expectCorrectnessSuite([
    {
      name: "math-extremes",
      validateLlvm: true,
      source: `
      import [Math] from "std/math.bpl";
      import printf from "std/c.bpl";
      extern atof(text: string) ret float;
      extern atan2(y: float, x: float) ret float;
      frame main() ret int {
        local big: float = atof("1e308");
        local small: float = atof("1e-308");
        local infinity: float = atof("inf");
        local notANumber: float = atof("nan");
        local negativeZero: float = atof("-0");

        # The quotient overflows, but the remainder is finite and in range.
        local remainder: float = Math.mod(big, small);
        printf("%d %.1f %.1e %.1e %.1e %d %d %d %.1f\\n",
          cast<int>((remainder >= 0.0) && (remainder < small)),
          Math.mod(-5.5, 2.0),
          Math.lerp(-big, big, 0.0),
          Math.lerp(-big, big, 0.5),
          Math.lerp(-big, big, 1.0),
          cast<int>(Math.atan2(infinity, infinity) == atan2(infinity, infinity)),
          cast<int>(Math.isNan(Math.atan2(1.0, notANumber))),
          cast<int>(Math.atan2(negativeZero, -1.0) == atan2(negativeZero, -1.0)),
          Math.lerp(2.0, 4.0, 0.5));
        return 0;
      }`,
      expectedStdout: "1 0.5 -1.0e+308 0.0e+00 1.0e+308 1 1 1 3.0\n",
    },
  ]);
}, 60000);

test("UTF-8 validation rejects non-scalar and malformed encodings", () => {
  expectCorrectnessSuite([
    {
      name: "utf8-validation",
      validateLlvm: true,
      source: `
      import [UTF8] from "std/utf8.bpl";
      import printf from "std/c.bpl";
      frame main() ret int {
        # Isolated continuation, unusable lead, overlong three-byte, surrogate,
        # overlong four-byte, above U+10FFFF, truncated, then valid ones.
        local continuation: u8[2] = [cast<u8>(0x80), cast<u8>(0)];
        local unusable: u8[2] = [cast<u8>(0xFF), cast<u8>(0)];
        local overlong3: u8[4] = [cast<u8>(0xE0), cast<u8>(0x9F), cast<u8>(0xBF), cast<u8>(0)];
        local surrogate: u8[4] = [cast<u8>(0xED), cast<u8>(0xA0), cast<u8>(0x80), cast<u8>(0)];
        local overlong4: u8[5] = [cast<u8>(0xF0), cast<u8>(0x8F), cast<u8>(0xBF), cast<u8>(0xBF), cast<u8>(0)];
        local tooLarge: u8[5] = [cast<u8>(0xF4), cast<u8>(0x90), cast<u8>(0x80), cast<u8>(0x80), cast<u8>(0)];
        local truncated: u8[3] = [cast<u8>(0xE1), cast<u8>(0x80), cast<u8>(0)];
        local belowSurrogate: u8[4] = [cast<u8>(0xED), cast<u8>(0x9F), cast<u8>(0xBF), cast<u8>(0)];
        local maximum: u8[5] = [cast<u8>(0xF4), cast<u8>(0x8F), cast<u8>(0xBF), cast<u8>(0xBF), cast<u8>(0)];
        local emoji: u8[5] = [cast<u8>(0xF0), cast<u8>(0x9F), cast<u8>(0x98), cast<u8>(0x80), cast<u8>(0)];
        printf("%d%d%d%d%d%d%d%d%d%d%d\\n",
          cast<int>(UTF8.isValid(cast<string>(&continuation[0]))),
          cast<int>(UTF8.isValid(cast<string>(&unusable[0]))),
          cast<int>(UTF8.isValid(cast<string>(&overlong3[0]))),
          cast<int>(UTF8.isValid(cast<string>(&surrogate[0]))),
          cast<int>(UTF8.isValid(cast<string>(&overlong4[0]))),
          cast<int>(UTF8.isValid(cast<string>(&tooLarge[0]))),
          cast<int>(UTF8.isValid(cast<string>(&truncated[0]))),
          cast<int>(UTF8.isValid(cast<string>(&belowSurrogate[0]))),
          cast<int>(UTF8.isValid(cast<string>(&maximum[0]))),
          cast<int>(UTF8.isValid(cast<string>(&emoji[0]))),
          cast<int>(UTF8.isValid("abc")));
        return 0;
      }`,
      // Verified against Python's strict UTF-8 decoder for all eleven inputs.
      expectedStdout: "00000001111\n",
    },
  ]);
}, 60000);

test("interpolation, harmonic mean, and normalization hold for identical and extreme inputs", () => {
  expectCorrectnessSuite([
    {
      name: "scaling-identities",
      validateLlvm: true,
      source: `
      import [Math] from "std/math.bpl";
      import [Stats] from "std/stats.bpl";
      import [Vec2] from "std/vec2.bpl";
      import [Vec3] from "std/vec3.bpl";
      import printf from "std/c.bpl";
      extern atof(text: string) ret float;

      frame main() ret int {
        local tiny: float = atof("5e-324");
        local small: float = atof("1e-309");
        local huge: float = atof("1.5e308");

        # Interpolating between identical endpoints returns that endpoint,
        # which halving each one separately would round to zero.
        local pair: float[2] = [tiny, tiny];
        local identical: int = cast<int>(Math.lerp(tiny, tiny, 0.5) == tiny);
        local percentileIdentical: int =
          cast<int>(Stats.percentile(&pair[0], 2, 50.0) == tiny);

        # A reciprocal of the sample itself would overflow.
        local repeated: float[2] = [small, small];
        local harmonicOne: int = cast<int>(Stats.harmonicMean(&repeated[0], 1) == small);
        local harmonicTwo: int = cast<int>(Stats.harmonicMean(&repeated[0], 2) == small);

        # The magnitude is unrepresentable, but the direction is not.
        local wide2: Vec2 = Vec2.new(huge, huge);
        local wide3: Vec3 = Vec3.new(huge, huge, 0.0);
        local unit2: Vec2 = wide2.normalize();
        local unit3: Vec3 = wide3.normalize();
        local plain: Vec2 = Vec2.new(3.0, 4.0);
        local unitPlain: Vec2 = plain.normalize();
        local zero: Vec2 = Vec2.new(0.0, 0.0);
        local unitZero: Vec2 = zero.normalize();

        local ordinaryHarmonic: float[2] = [2.0, 6.0];
        printf("%d %d %d %d %.6f %.6f %.6f %.1f %.1f %.1f\\n",
          identical, percentileIdentical, harmonicOne, harmonicTwo,
          unit2.x, unit3.y, unitZero.x,
          unitPlain.x * 5.0, unitPlain.y * 5.0,
          Stats.harmonicMean(&ordinaryHarmonic[0], 2));
        return 0;
      }`,
      expectedStdout: "1 1 1 1 0.707107 0.707107 0.000000 3.0 4.0 3.0\n",
    },
  ]);
}, 60000);

test("complex division holds for tiny divisors as well as huge ones", () => {
  expectCorrectnessSuite([
    {
      name: "complex-divisor-range",
      validateLlvm: true,
      source: `
      import [Complex] from "std/complex.bpl";
      import printf from "std/c.bpl";
      extern atof(text: string) ret float;
      frame main() ret int {
        local tiny: float = atof("1e-308");
        local halfTiny: float = atof("5e-309");
        # An ordinary numerator over a tiny divisor: scaling the numerator by
        # the divisor's magnitude would overflow before dividing.
        local numerator: Complex = Complex.new(1.0, 1.0);
        local divisor: Complex = Complex.new(tiny, tiny);
        local quotient: Complex = numerator.div(divisor);
        local inverse: Complex = Complex.new(halfTiny, halfTiny).reciprocal();
        local control: Complex = numerator.div(numerator);
        local zeroOverOne: Complex = Complex.new(0.0, 0.0).div(numerator);
        printf("%.1e %.1f %.1e %.1e %.1f %.1f %.1f\\n",
          quotient.real, quotient.imag,
          inverse.real, inverse.imag,
          control.real, control.imag, zeroOverOne.real);
        return 0;
      }`,
      expectedStdout: "1.0e+308 0.0 1.0e+308 -1.0e+308 1.0 0.0 0.0\n",
    },
  ]);
}, 60000);
