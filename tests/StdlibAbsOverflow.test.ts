import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const value of ["-2147483648", 'atoi("-2147483648")']) {
  test(`integer abs rejects an unrepresentable magnitude from ${value}`, () => {
    expectCorrectnessSuite([
      {
        name: value.startsWith("atoi")
          ? "abs-overflow-runtime"
          : "abs-overflow-literal",
        validateLlvm: true,
        source: `
          import [Math] from "std/math.bpl";
          extern atoi(value: string) ret int;
          extern strcmp(a: string, b: string) ret int;
          frame main() ret int {
            local minimum: int = ${value};
            local caught: bool = false;
            try { Math.abs(minimum); }
            catch (error: string) { caught = strcmp(error, "Math.abs result exceeds int") == 0; }
            if (!caught) { return 1; }
            return 0;
          }`,
      },
    ]);
  }, 60000);
}

test("abs retains ordinary integer and floating behavior", () => {
  expectCorrectnessSuite([
    {
      name: "abs-controls",
      validateLlvm: true,
      source: `
        import [Math] from "std/math.bpl";
        extern atof(value: string) ret float;
        frame main() ret int {
          if (Math.abs(-2147483647) != 2147483647 || Math.abs(2147483647) != 2147483647) { return 1; }
          if (Math.abs(-1) != 1 || Math.abs(0) != 0 || Math.abs(1) != 1) { return 2; }
          if (Math.abs(-3.5) != 3.5 || Math.abs(3.5) != 3.5) { return 3; }
          if (Math.copysign(1.0, Math.abs(atof("-0"))) != 1.0) { return 4; }
          if (Math.abs(atof("-inf")) != atof("inf") || !Math.isNan(Math.abs(atof("nan")))) { return 5; }
          return 0;
        }`,
    },
  ]);
}, 60000);
