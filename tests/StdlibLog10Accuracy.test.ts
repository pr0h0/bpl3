import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const exponent of [3, 6, 9, -3, -6, -9]) {
  test(`log10 retains exact power ${exponent}`, () => {
    expectCorrectnessSuite([
      {
        name: `log10-power-${exponent}`,
        validateLlvm: true,
        source: `
          import [Math] from "std/math.bpl";
          extern atof(value: string) ret float;
          frame main() ret int {
            local value: float = atof("1e${exponent}");
            if (Math.log10(value) != cast<float>(${exponent})) { return 1; }
            return 0;
          }`,
      },
    ]);
  }, 60000);
}

test("log10 retains ordinary, limit and domain behavior", () => {
  expectCorrectnessSuite([
    {
      name: "log10-controls",
      validateLlvm: true,
      source: `
        import [Math] from "std/math.bpl";
        extern atof(value: string) ret float;
        extern log10(value: float) ret float;
        frame main() ret int {
          local samples: float[7] = [0.1, 0.5, 2.0, 3.0, 10.0, atof("1.7976931348623157e308"), atof("5e-324")];
          loop (local i: int = 0; i < 7; i = i + 1) {
            local expected: float = log10(samples[i]);
            if (!(Math.abs(Math.log10(samples[i]) / expected - 1.0) < 0.000000000000004)) { return 1; }
          }
          if (Math.log10(1.0) != 0.0 || Math.copysign(1.0, Math.log10(1.0)) != 1.0) { return 2; }
          if (Math.log10(0.0) != atof("-inf") || Math.log10(atof("-0")) != atof("-inf")) { return 3; }
          if (Math.log10(atof("inf")) != atof("inf")) { return 4; }
          if (!Math.isNan(Math.log10(-1.0)) || !Math.isNan(Math.log10(atof("-inf")))) { return 5; }
          if (!Math.isNan(Math.log10(atof("nan")))) { return 6; }
          return 0;
        }`,
    },
  ]);
}, 60000);
