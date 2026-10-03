import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("Rational powers handle the minimum exponent and ordinary signed powers", () => {
  const cases = Array.from({ length: 21 }, (_, i) => i - 10);
  const expected = cases.map(n => {
    const magnitude = BigInt(Math.abs(n));
    const numerator = (n < 0 ? 3n : 2n) ** magnitude * (n % 2 === 0 ? 1n : -1n);
    const denominator = (n < 0 ? 2n : 3n) ** magnitude;
    return `${numerator} ${denominator}`;
  });
  expectCorrectnessSuite([{
    name: "rational-power-exponents",
    validateLlvm: true,
    source: `
      import [Rational] from "std/rational.bpl";
      extern printf(fmt: string, ...);
      frame main() ret int {
        local zero: Rational = Rational.zero();
        local invalid: Rational = Rational.new(1, 0);
        local zeroPower: Rational = zero.pow(cast<int>(-2147483648));
        local invalidPower: Rational = invalid.pow(cast<int>(-2147483648));
        if (zeroPower.isValid() || invalidPower.isValid()) { return 1; }
        local negativeOne: Rational = Rational.fromInt(-1);
        local unitPower: Rational = negativeOne.pow(cast<int>(-2147483648));
        if (unitPower.num != 1 || unitPower.den != 1) { return 2; }
        local base: Rational = Rational.new(-2, 3);
        loop (local n: int = -10; n <= 10; n = n + 1) {
          local result: Rational = base.pow(n);
          printf("%ld %ld\\n", result.num, result.den);
        }
        return 0;
      }`,
    expectedStdout: expected.join("\n") + "\n",
  }]);
}, 60000);
