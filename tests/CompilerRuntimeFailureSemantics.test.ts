import { describe, expect, test } from "bun:test";

import { expectRuntimeFailureSuite } from "./helpers/compilerCorrectness";

describe("Compiler runtime failure semantics", () => {
  test(
    "keeps checked runtime failures equivalent across O0 and O3",
    () => {
      const results = expectRuntimeFailureSuite([
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
        {
          name: "stack overflow",
          expectedMessage: "STACK OVERFLOW",
          source: `
            frame recur(value: int) ret int {
              return recur(value + 1);
            }

            frame main() ret int {
              return recur(0);
            }
          `,
        },
      ]);

      expect(results).toHaveLength(4);
      for (const result of results) {
        expect(result.o0.exitCode).not.toBe(0);
        expect(result.o3.exitCode).not.toBe(0);
      }
    },
    60000,
  );
});
