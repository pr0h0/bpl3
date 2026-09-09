import { it } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

it("promotes f32 variadic arguments while preserving fixed f32 parameters", () => {
  expectCorrectnessSuite([{
    name: "f32 C variadic promotion",
    validateLlvm: true,
    expectedStdout: "1.50 -2.25 3.50 4.50\n",
    source: `
      extern printf(fmt: string, ...) ret int;
      extern fabsf(value: f32) ret f32;
      frame main() ret int {
        local a: f32 = cast<f32>(1.5);
        local b: f32 = cast<f32>(-2.25);
        printf("%.2f %.2f %.2f %.2f\\n", a, b,
          fabsf(cast<f32>(-3.5)), 4.5);
        return 0;
      }
    `,
  }]);
}, 60000);

it("keeps scalar and aggregate NaN inequality complementary to equality", () => {
  expectCorrectnessSuite([{
    name: "NaN equality laws",
    validateLlvm: true,
    expectedStdout: "0 1 1\n1 1 0 1\n0 1\n",
    source: `
      extern printf(fmt: string, ...);
      extern nan(tag: string) ret float;
      struct Box { value: float }
      frame main() ret int {
        local n: float = nan("");
        printf("%d %d %d\\n", n == n, n != n, !(n == n));
        printf("%d %d %d %d\\n", n != 1.0, 1.0 != n, 1.0 != 1.0, 1.0 != 2.0);
        local a: Box = Box { value: n };
        printf("%d %d\\n", a == a, a != a);
        return 0;
      }
    `,
  }]);
}, 60000);

it("preserves signed zero through floating-point negation", () => {
  expectCorrectnessSuite([{
    name: "signed zero negation",
    validateLlvm: true,
    expectedStdout: "-1.0 1.0 -2.5\n",
    source: `
      extern printf(fmt: string, ...);
      extern copysign(x: float, y: float) ret float;
      frame negate(x: float) ret float { return -x; }
      frame main() ret int {
        local z: float = 0.0;
        printf("%.1f %.1f %.1f\\n", copysign(1.0, negate(z)),
          copysign(1.0, negate(negate(z))), negate(2.5));
        return 0;
      }
    `,
  }]);
}, 60000);

it("supports every float spelling through arithmetic, calls, and explicit conversions", () => {
  expectCorrectnessSuite([{
    name: "f32 and f64 arithmetic",
    validateLlvm: true,
    expectedStdout: "-1.5 2.5 3.0 0.5 0.8\n3 -3 7.0\n8.0 0 1\n",
    source: `
      extern printf(fmt: string, ...);
      frame negate(x: f32) ret f32 { return -x; }
      frame main() ret int {
        local x: f32 = cast<f32>(1.5);
        local y: f32 = cast<f32>(2);
        printf("%.1f %.1f %.1f %.1f %.1f\\n", cast<float>(negate(x)),
          cast<double>(x + cast<f32>(1)), cast<f64>(x * y),
          cast<float>(y - x), cast<float>(x / y));
        printf("%d %d %.1f\\n", cast<int>(cast<f32>(3.75)),
          cast<int>(cast<f32>(-3.75)), cast<float>(cast<f32>(cast<uint>(7))));
        local a: f64 = 4.0;
        local b: double = a;
        local c: float = b;
        printf("%.1f %d %d\\n", a + c, x == y, x < y);
        return 0;
      }
    `,
  }]);
}, 60000);
