import { describe, expect, test } from "bun:test";
import {
  checkBplSanitizerSupport,
  getSanitizerRuntimeTestTimeoutMs,
  runBplWithSanitizers,
} from "./helpers/compilerCorrectness";

const SANITIZER_RUNTIME_TEST_TIMEOUT_MS = getSanitizerRuntimeTestTimeoutMs();

describe("Compiler sanitizer-backed runtime tests", () => {
  test(
    "runs representative safe runtime behavior under ASan and UBSan",
    () => {
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
    },
    SANITIZER_RUNTIME_TEST_TIMEOUT_MS,
  );

  test(
    "routes checked runtime failures through BPL errors under ASan and UBSan",
    () => {
      const support = checkBplSanitizerSupport();
      if (!support.supported) {
        expect(support.reason).toContain("libclang_rt");
        return;
      }

      const cases = [
        {
          name: "division by zero",
          expectedMessage: "DIVISION BY ZERO",
          source: `
          frame main() ret int {
            local zero: int = 0;
            return 10 / zero;
          }
        `,
        },
        {
          name: "signed integer division overflow",
          expectedMessage: "INTEGER OVERFLOW",
          source: `
          frame main() ret int {
            local min: int = -2147483648;
            local negativeOne: int = -1;
            return min / negativeOne;
          }
        `,
        },
        {
          name: "null pointer member access",
          expectedMessage: "NULL POINTER ACCESS",
          source: `
          struct Node {
            value: int,
          }

          frame main() ret int {
            local node: *Node = nullptr;
            return node.value;
          }
        `,
        },
        {
          name: "fixed array index out of bounds",
          expectedMessage: "INDEX OUT OF BOUNDS",
          source: `
          frame main() ret int {
            local values: int[2] = [10, 20];
            return values[3];
          }
        `,
        },
      ];

      for (const testCase of cases) {
        for (const optimizationLevel of [0, 3] as const) {
          const result = runBplWithSanitizers(
            testCase.source,
            optimizationLevel,
          );

          expect(result.exitCode).not.toBe(0);
          expect(result.stderr).toContain(testCase.expectedMessage);
          expect(result.stderr).not.toContain("ERROR: AddressSanitizer");
          expect(result.stderr).not.toContain("runtime error:");
        }
      }
    },
    SANITIZER_RUNTIME_TEST_TIMEOUT_MS,
  );
});
