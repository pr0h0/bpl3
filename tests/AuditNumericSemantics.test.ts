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
