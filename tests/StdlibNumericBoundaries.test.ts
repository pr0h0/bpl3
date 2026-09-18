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
