import { it } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

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
