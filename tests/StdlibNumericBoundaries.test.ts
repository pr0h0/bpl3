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
