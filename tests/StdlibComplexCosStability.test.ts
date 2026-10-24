import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

// Expectations from the platform C complex function; nonfinite zero signs are unspecified.
const cases = [
  [
    "tiny imaginary",
    "1",
    "1e-300",
    "0.54030230586813977",
    "-8.4147098480789653e-301",
    true,
  ],
  ["large imaginary axis", "0", "710", "1.1169973830808555e+308", "-0", true],
  [
    "finite mixed component",
    "1e-300",
    "720",
    "inf",
    "-2460350465131.9082",
    true,
  ],
  [
    "minimum mixed component",
    "5e-324",
    "1450",
    "inf",
    "-1.3175084853168172e+306",
    true,
  ],
  [
    "large negative imaginary",
    "1",
    "-710",
    "6.0351626172726406e+307",
    "9.3992088796889055e+307",
    true,
  ],
  ["ordinary", "3", "4", "-27.034945603074224", "-3.851153334811777", true],
  ["small components", "1e-8", "1e-8", "1", "-1.0000000000000002e-16", true],
  ["signed zero", "0", "-0", "1", "0", true],
  ["infinite real axis", "inf", "-0", "-nan", "0", false],
  ["NaN real axis", "nan", "0", "nan", "0", false],
  ["NaN imaginary axis", "0", "nan", "nan", "0", false],
  ["NaN real infinite imaginary", "nan", "inf", "inf", "nan", false],
  ["infinite components", "inf", "inf", "inf", "-nan", false],
  [
    "subnormal imaginary component",
    "5e-324",
    "1",
    "1.5430806348152437",
    "-4.9406564584124654e-324",
    true,
  ],
  [
    "series lower boundary",
    "1",
    "0.499999999999",
    "0.6092589091575128",
    "-0.43848657989164652",
    true,
  ],
  [
    "series upper boundary",
    "1",
    "0.500000000001",
    "0.60925890915807579",
    "-0.43848657989354417",
    true,
  ],
  [
    "negative series input",
    "1",
    "-0.25",
    "0.55727487616753935",
    "0.21256593499917373",
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
  test(`complex cos preserves ${name}`, () => {
    expectCorrectnessSuite([
      {
        name: `complex-cos-${name.replaceAll(" ", "-")}`,
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
            local result: Complex = value.cos();
            if (!agrees(result.real, atof("${expectedReal}"))) { return 1; }
            if (!agrees(result.imag, atof("${expectedImag}"))) { return 2; }
            return 0;
          }`,
      },
    ]);
  }, 60000);
}
