import { describe, expect, it } from "bun:test";
import { compileAndRun } from "./helpers/compileAndRun";

describe("Array Equality", () => {
  it("compares the full byte size of struct elements", () => {
    const output = compileAndRun(`
      extern printf(fmt: string, ...) ret int;

      struct Wide {
        a: int,
        b: int,
        c: int,
      }

      frame main() ret int {
        local left: Wide[1] = [Wide { a: 1, b: 2, c: 3 }];
        local right: Wide[1] = [Wide { a: 1, b: 2, c: 99 }];

        if (left == right) {
          printf("equal\\n");
        } else {
          printf("different\\n");
        }

        return 0;
      }
    `);

    expect(output).toBe("different\n");
  });
});
