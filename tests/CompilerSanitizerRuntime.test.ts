import { describe, expect, test } from "bun:test";
import {
  checkBplSanitizerSupport,
  runBplWithSanitizers,
} from "./helpers/compilerCorrectness";

describe("Compiler sanitizer-backed runtime tests", () => {
  test("runs representative safe runtime behavior under ASan and UBSan", () => {
    const support = checkBplSanitizerSupport();
    if (!support.supported) {
      expect(support.reason).toContain("libclang_rt");
      return;
    }

    const source = `
      extern printf(fmt: string, ...);

      struct Pair {
        left: int,
        right: int,
      }

      frame bump(pair: *Pair, value: int) ret void {
        pair.left = pair.left + value;
        pair.right = pair.right + (value * 2);
      }

      frame main() ret int {
        local pair: Pair = Pair { left: 3, right: 5 };
        local values: int[4] = [1, 2, 3, 4];
        local i: int = 0;

        loop (i < 4) {
          bump(&pair, values[i]);
          i = i + 1;
        }

        printf("sanitizer-ok %d %d\\n", pair.left, pair.right);
        return 0;
      }
    `;

    for (const optimizationLevel of [0, 3] as const) {
      const result = runBplWithSanitizers(source, optimizationLevel);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("sanitizer-ok 13 25");
      expect(result.stderr).not.toContain("ERROR: AddressSanitizer");
      expect(result.stderr).not.toContain("runtime error:");
    }
  });
});
