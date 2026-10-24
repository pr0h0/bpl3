import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const value of [
  "0.999",
  "0.99999999",
  "0.999999999999",
  "0.99999999999999",
]) {
  test(`acos preserves endpoint accuracy at ${value}`, () => {
    expectCorrectnessSuite([
      {
        name: `acos-accuracy-${value}`,
        validateLlvm: true,
        source: `
          import [Math] from "std/math.bpl";
          extern atof(value: string) ret float;
          extern acos(value: float) ret float;
          frame main() ret int {
            local x: float = atof("${value}");
            if (!(Math.abs(Math.acos(x) / acos(x) - 1.0) < 0.000000000000002)) { return 1; }
            return 0;
          }`,
      },
    ]);
  }, 60000);
}

test("acos preserves valid values, endpoints and domain failures", () => {
  expectCorrectnessSuite([
    {
      name: "acos-controls",
      validateLlvm: true,
      source: `
        import [Math] from "std/math.bpl";
        extern atof(value: string) ret float;
        extern acos(value: float) ret float;
        frame main() ret int {
          local inputs: float[7] = [-1.0,-0.999999999999,-0.5,0.0,0.5,0.75,1.0];
          loop (local i: int = 0; i < 7; i = i + 1) {
            if (!(Math.abs(Math.acos(inputs[i]) - acos(inputs[i])) < 0.000000000000002)) { return 1; }
          }
          if (Math.acos(1.0) != 0.0 || Math.copysign(1.0, Math.acos(1.0)) != 1.0) { return 2; }
          if (!Math.isNan(Math.acos(1.5)) || !Math.isNan(Math.acos(-1.5))) { return 3; }
          if (!Math.isNan(Math.acos(atof("inf"))) || !Math.isNan(Math.acos(atof("-inf")))) { return 4; }
          if (!Math.isNan(Math.acos(atof("nan")))) { return 5; }
          return 0;
        }`,
    },
  ]);
}, 60000);
