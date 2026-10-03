import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}
const cases: Array<{ a: bigint; ad: bigint; b: bigint; bd: bigint; num: bigint; den: bigint }> = [];
for (const common of [840000000000000000n, 1200000000000000000n]) {
  for (let a = 1n; a < 10n; a++) {
    for (let b = 1n; b < 10n; b++) {
      const ad = 5n * common;
      const bd = 7n * common;
      const numerator = a * bd + b * ad;
      const denominator = ad * bd;
      const factor = gcd(numerator, denominator);
      if (denominator / factor <= (1n << 63n) - 1n) {
        cases.push({ a, ad, b, bd, num: numerator / factor, den: denominator / factor });
      }
    }
  }
}

test("Rational addition cancels denominator factors before forming their product", () => {
  expectCorrectnessSuite([{
    name: "rational-wide-common-denominator",
    validateLlvm: true,
    source: `
      import [Rational] from "std/rational.bpl";
      extern printf(fmt: string, ...);
      frame main() ret int {
        ${cases.map(({ a, ad, b, bd }, i) => `
          local a${i}: Rational = Rational.new(${a}, ${ad});
          local b${i}: Rational = Rational.new(${b}, ${bd});
          local result${i}: Rational = a${i}.add(b${i});
          printf("%ld/%ld\\n", result${i}.num, result${i}.den);
        `).join("\n")}
        return 0;
      }`,
    expectedStdout: cases.map(({ num, den }) => `${num}/${den}`).join("\n") + "\n",
  }]);
}, 60000);
