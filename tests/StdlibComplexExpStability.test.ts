import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

// Expectations from the platform C complex function; nonfinite zero signs are unspecified.
const cases = [
  ["ordinary", "1", "0.5", "2.3855167309591354", "1.3032137296869954", true],
  ["positive overflow", "710", "1", "1.2070325234545281e+308", "inf", true],
  [
    "negative angle overflow",
    "710",
    "-1",
    "1.2070325234545281e+308",
    "-inf",
    true,
  ],
  [
    "tiny angle at overflow",
    "720",
    "1e-300",
    "inf",
    "4920700930263.8164",
    true,
  ],
  [
    "minimum angle at overflow",
    "1450",
    "5e-324",
    "inf",
    "2.6350169706336343e+306",
    true,
  ],
  [
    "subnormal output",
    "-740",
    "1",
    "2.2727019708697341e-322",
    "3.5572726500569751e-322",
    true,
  ],
  ["positive axis overflow", "1000", "0", "inf", "0", true],
  ["negative zero axis", "1", "-0", "2.7182818284590451", "-0", true],
  ["infinite real axis", "inf", "-0", "inf", "-0", false],
  ["NaN real axis", "nan", "-0", "nan", "-0", false],
  ["negative infinite invalid phase", "-inf", "nan", "0", "0", false],
  ["positive infinite invalid phase", "inf", "nan", "inf", "nan", false],
  [
    "ordinary negative",
    "-1",
    "-1",
    "0.19876611034641298",
    "-0.30955987565311222",
    true,
  ],
] as const;

for (const [
  name,
  real,
  imag,
  expectedReal,
  expectedImag,
  strictZero,
] of cases) {
  test(`complex exp preserves ${name}`, () => {
    expectCorrectnessSuite([
      {
        name: `complex-exp-${name.replaceAll(" ", "-")}`,
        validateLlvm: true,
        source: `
          import [Complex] from "std/complex.bpl";
          import [Math] from "std/math.bpl";
          extern atof(value: string) ret float;
          frame agrees(actual: float, expected: float) ret bool {
            if (Math.isNan(expected)) { return Math.isNan(actual); }
            if (Math.isInfinite(expected)) { return actual == expected; }
            if (expected == 0.0) {
              return actual == 0.0 ${strictZero ? "&& Math.copysign(1.0, actual) == Math.copysign(1.0, expected)" : ""};
            }
            if (Math.abs(expected) < atof("2.2250738585072014e-308")) {
              return actual != 0.0 && Math.abs(actual - expected) <= atof("5e-324");
            }
            return Math.abs(actual / expected - 1.0) < 0.00000000000001;
          }
          frame main() ret int {
            local value: Complex = Complex.new(atof("${real}"), atof("${imag}"));
            local result: Complex = value.exp();
            if (!agrees(result.real, atof("${expectedReal}"))) { return 1; }
            if (!agrees(result.imag, atof("${expectedImag}"))) { return 2; }
            return 0;
          }`,
      },
    ]);
  }, 60000);
}
