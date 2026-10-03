import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("Complex log avoids overflowing or rounding the intermediate magnitude", () => {
  const cases = [
    ["1.7976931348623157e308", "1.7976931348623157e308", Math.log(Number.MAX_VALUE) + Math.log(2) / 2],
    ["4.9406564584124654e-324", "4.9406564584124654e-324", Math.log(Number.MIN_VALUE) + Math.log(2) / 2],
    ["1", "1e-8", Math.log1p(1e-16) / 2],
    ["3", "4", Math.log(5)],
    ["-3", "4", Math.log(5)],
  ] as const;
  expectCorrectnessSuite([{
    name: "complex-log-magnitude-bounds",
    validateLlvm: true,
    source: `
      import [Complex] from "std/complex.bpl";
      import [Math] from "std/math.bpl";
      extern atof(text: string) ret float;
      extern atan2(y: float, x: float) ret float;
      frame main() ret int {
        ${cases.map(([real, imag, expected], i) => `
          local z${i}: Complex = Complex.new(atof("${real}"), atof("${imag}"));
          local value${i}: Complex = z${i}.log();
          local expected${i}: float = atof("${expected}");
          if ((Math.isNan(value${i}.real) || Math.isInfinite(value${i}.real)) || Math.abs(value${i}.real - expected${i}) > Math.abs(expected${i}) * atof("2e-15")) { return ${i + 1}; }
          if (value${i}.imag != atan2(z${i}.imag, z${i}.real)) { return 6; }
        `).join("\n")}
        local zero: Complex = Complex.zero().log();
        if (!Math.isInfinite(zero.real) || zero.real >= 0.0 || zero.imag != 0.0) { return 7; }
        local infinity: Complex = Complex.new(atof("inf"), 1.0).log();
        if (!Math.isInfinite(infinity.real) || infinity.real < 0.0) { return 8; }
        local nan: Complex = Complex.new(atof("nan"), 0.0).log();
        if (!Math.isNan(nan.real)) { return 9; }
        return 0;
      }`,
    expectedStdout: "",
  }]);
}, 60000);
