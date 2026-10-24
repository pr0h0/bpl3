import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

// Component expectations from Python cmath.sqrt; preserve branch-cut zero signs.
const cases = [
  [
    "huge positive",
    "1.7976931348623157e308",
    "1.7976931348623157e308",
    "1.4730945569055655e+154",
    "6.101757441282702e+153",
  ],
  [
    "huge negative imaginary",
    "1.7976931348623157e308",
    "-1.7976931348623157e308",
    "1.4730945569055655e+154",
    "-6.101757441282702e+153",
  ],
  [
    "huge negative real",
    "-1.7976931348623157e308",
    "1.7976931348623157e308",
    "6.101757441282702e+153",
    "1.4730945569055655e+154",
  ],
  [
    "subnormal positive",
    "4.9406564584124654e-324",
    "4.9406564584124654e-324",
    "2.4421097261308304e-162",
    "1.0115549693666347e-162",
  ],
  [
    "subnormal negative imaginary",
    "4.9406564584124654e-324",
    "-4.9406564584124654e-324",
    "2.4421097261308304e-162",
    "-1.0115549693666347e-162",
  ],
  ["negative axis upper", "-4", "0", "0.0", "2.0"],
  ["negative axis lower", "-4", "-0", "0.0", "-2.0"],
  ["positive axis lower", "4", "-0", "2.0", "-0.0"],
  ["signed zero", "-0", "-0", "0.0", "-0.0"],
  ["ordinary", "3", "4", "2.0", "1.0"],
  ["ordinary negative real", "-3", "4", "1.0", "2.0"],
  ["tiny imaginary", "1", "1e-300", "1.0", "5e-301"],
  ["negative mixed scale", "-1e308", "1e-100", "5e-255", "1e+154"],
  ["positive mixed scale", "1e308", "-1e-100", "1e+154", "-5e-255"],
  ["infinite imaginary", "1", "inf", "inf", "inf"],
  ["infinite imaginary with NaN", "nan", "-inf", "inf", "-inf"],
  ["infinite real", "inf", "1", "inf", "0.0"],
  ["negative infinite real", "-inf", "-1", "0.0", "-inf"],
  ["infinite real with NaN", "inf", "nan", "inf", "nan"],
  ["negative infinite real with NaN", "-inf", "nan", "nan", "inf"],
  ["NaN real", "nan", "1", "nan", "nan"],
  ["NaN imaginary", "1", "nan", "nan", "nan"],
] as const;

for (const [name, real, imag, expectedReal, expectedImag] of cases) {
  test(`complex sqrt preserves ${name}`, () => {
    expectCorrectnessSuite([
      {
        name: `complex-sqrt-${name.replaceAll(" ", "-")}`,
        validateLlvm: true,
        source: `
          import [Complex] from "std/complex.bpl";
          import [Math] from "std/math.bpl";
          extern atof(value: string) ret float;
          frame agrees(actual: float, expected: float) ret bool {
            if (Math.isNan(expected)) { return Math.isNan(actual); }
            if (Math.isInfinite(expected)) { return actual == expected; }
            if (expected == 0.0) {
              return actual == 0.0 && Math.copysign(1.0, actual) == Math.copysign(1.0, expected);
            }
            return Math.abs(actual / expected - 1.0) < 0.000000000000004;
          }
          frame main() ret int {
            local value: Complex = Complex.new(atof("${real}"), atof("${imag}"));
            local result: Complex = value.sqrt();
            if (!agrees(result.real, atof("${expectedReal}"))) { return 1; }
            if (!agrees(result.imag, atof("${expectedImag}"))) { return 2; }
            return 0;
          }`,
      },
    ]);
  }, 60000);
}
