import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const value of ["2", "-2", "inf", "-inf"]) {
  test(`asin rejects out-of-domain ${value}`, () => {
    expectCorrectnessSuite([
      {
        name: `asin-domain-${value.replaceAll("-", "negative-")}`,
        validateLlvm: true,
        source: `
          import [Math] from "std/math.bpl";
          extern atof(value: string) ret float;
          frame main() ret int {
            if (!Math.isNan(Math.asin(atof("${value}")))) { return 1; }
            return 0;
          }`,
      },
    ]);
  }, 60000);
}

test("asin preserves valid values, endpoints, signed zero and NaN", () => {
  expectCorrectnessSuite([
    {
      name: "asin-controls",
      validateLlvm: true,
      source: `
        import [Math] from "std/math.bpl";
        extern atof(value: string) ret float;
        extern asin(value: float) ret float;
        frame main() ret int {
          local inputs: float[9] = [-1.0,-0.999999999999,-0.75,-0.5,0.0,0.5,0.75,0.999999999999,1.0];
          loop (local i: int = 0; i < 9; i = i + 1) {
            local expected: float = asin(inputs[i]);
            if (!(Math.abs(Math.asin(inputs[i]) - expected) < 0.000000000000002)) { return 1; }
          }
          if (Math.copysign(1.0, Math.asin(atof("-0"))) != -1.0) { return 2; }
          if (!Math.isNan(Math.asin(atof("nan")))) { return 3; }
          return 0;
        }`,
    },
  ]);
}, 60000);
