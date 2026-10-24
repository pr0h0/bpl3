import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

// Expectations from the platform C complex function; nonfinite zero signs are unspecified.
const cases = [
  ["tiny imaginary", "0", "1e-300", "0", "1e-300", true],
  ["negative tiny imaginary", "0", "-1e-300", "0", "-1e-300", true],
  [
    "tiny imaginary with real part",
    "1",
    "1e-300",
    "0.8414709848078965",
    "5.4030230586813975e-301",
    true,
  ],
  ["large imaginary axis", "0", "710", "0", "1.1169973830808555e+308", true],
  [
    "finite mixed component",
    "1e-300",
    "720",
    "2460350465131.9082",
    "inf",
    true,
  ],
  [
    "minimum mixed component",
    "5e-324",
    "1450",
    "1.3175084853168172e+306",
    "inf",
    true,
  ],
  [
    "large negative imaginary",
    "2",
    "-710",
    "1.0156828462064421e+308",
    "4.6483492740053462e+307",
    true,
  ],
  ["ordinary", "3", "4", "3.8537380379193769", "-27.016813258003932", true],
  ["small components", "1e-8", "1e-8", "1e-08", "1.0000000000000002e-08", true],
  ["signed zero", "-0", "-0", "-0", "-0", true],
  ["infinite real axis", "inf", "0", "-nan", "0", false],
  ["NaN real axis", "nan", "-0", "nan", "-0", false],
  ["NaN imaginary axis", "0", "nan", "0", "nan", false],
  ["NaN real infinite imaginary", "nan", "inf", "nan", "inf", false],
  ["infinite components", "inf", "inf", "-nan", "inf", false],
  [
    "subnormal real component",
    "5e-324",
    "1",
    "9.8813129168249309e-324",
    "1.1752011936438014",
    true,
  ],
  [
    "series lower boundary",
    "1",
    "0.499999999999",
    "0.94886453143672966",
    "0.2815489951347252",
    true,
  ],
  [
    "series upper boundary",
    "1",
    "0.500000000001",
    "0.94886453143760652",
    "0.28154899513594372",
    true,
  ],
  [
    "negative series input",
    "1",
    "-0.25",
    "0.86790419689942977",
    "-0.13648701726214638",
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
  test(`complex sin preserves ${name}`, () => {
    expectCorrectnessSuite([
      {
        name: `complex-sin-${name.replaceAll(" ", "-")}`,
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
            local result: Complex = value.sin();
            if (!agrees(result.real, atof("${expectedReal}"))) { return 1; }
            if (!agrees(result.imag, atof("${expectedImag}"))) { return 2; }
            return 0;
          }`,
      },
    ]);
  }, 60000);
}
