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

  it("compares struct elements semantically without padding bytes", () => {
    const output = compileAndRun(`
      extern printf(fmt: string, ...) ret int;

      struct Wide {
        tag: i8,
        value: long,
      }

      frame make(tag: i8, value: long) ret Wide[1] {
        local filler: long[3] = [value, value + 1, value + 2];
        if (value < 0) {
          printf("%ld", filler[0]);
        }
        return [Wide { tag: tag, value: value }];
      }

      frame main() ret int {
        local left: Wide[1] = make(3, 4294967296);
        local right: Wide[1] = make(3, 4294967296);

        if (left == right) {
          printf("equal\\n");
        } else {
          printf("not equal\\n");
        }

        return 0;
      }
    `);

    expect(output).toBe("equal\n");
  });
});
