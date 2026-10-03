import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

const minimum = -(1n << 63n);
const cases: Array<[bigint, bigint]> = [
  [minimum, -1n], [-1n, minimum], [minimum, 1n], [1n, minimum],
  [minimum, -2n], [-2n, minimum], [minimum, 3n], [3n, minimum],
  [0n, -1n], [-1n, 0n], [-72n, 30n], [72n, -30n],
];
const gcd = (a: bigint, b: bigint): bigint => {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
};
test("Rational gcd handles LONG_MIN and negative unit divisors", () => {
  expectCorrectnessSuite([{
    name: "rational-gcd-negative-unit",
    validateLlvm: true,
    source: `
      import [Rational] from "std/rational.bpl";
      extern printf(fmt: string, ...);
      frame main() ret int {
        ${cases.map(([a, b]) => `printf("%ld\\n", Rational.gcd(cast<long>(${a}), cast<long>(${b})));`).join("\n")}
        return 0;
      }`,
    expectedStdout: cases.map(([a, b]) => gcd(a, b)).join("\n") + "\n",
  }]);
}, 60000);
