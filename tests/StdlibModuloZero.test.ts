import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const dividend of ["0", "-0"]) {
  for (const divisor of ["inf", "-inf"]) {
    test(`zero modulo ${divisor} keeps the divisor sign for ${dividend}`, () => {
      expectCorrectnessSuite([
        {
          name: `mod-zero-${dividend}-${divisor}`,
          source: `
          import [Math] from "std/math.bpl";
          extern atof(value: string) ret float;
          frame main() ret int {
            local divisor: float = atof("${divisor}");
            local result: float = Math.mod(atof("${dividend}"), divisor);
            if (result != 0.0) { return 1; }
            if (Math.copysign(1.0, result) != Math.copysign(1.0, divisor)) { return 2; }
            return 0;
          }`,
        },
      ]);
    }, 60000);
  }
}

test("floor modulo retains finite zero signs, ordinary values, and invalid domains", () => {
  expectCorrectnessSuite([
    {
      name: "mod-zero-controls",
      source: `
      import [Math] from "std/math.bpl";
      extern atof(value: string) ret float;
      frame main() ret int {
        if (Math.copysign(1.0, Math.mod(-4.0, 2.0)) != 1.0) { return 1; }
        if (Math.copysign(1.0, Math.mod(4.0, -2.0)) != -1.0) { return 2; }
        if (Math.mod(-5.0, 2.0) != 1.0) { return 3; }
        if (Math.mod(5.0, -2.0) != -1.0) { return 4; }
        if (!Math.isNan(Math.mod(0.0, 0.0))) { return 5; }
        if (!Math.isNan(Math.mod(atof("inf"), 2.0))) { return 6; }
        if (!Math.isNan(Math.mod(0.0, atof("nan")))) { return 7; }
        return 0;
      }`,
    },
  ]);
}, 60000);
