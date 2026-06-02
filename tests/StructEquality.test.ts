import { describe, expect, it } from "bun:test";
import { compileAndRun } from "./helpers/compileAndRun";

describe("Struct Equality", () => {
  it("compares enum fields with enum payload semantics", () => {
    const output = compileAndRun(`
      extern printf(fmt: string, ...) ret int;

      enum E {
        V(float),
      }

      struct Box {
        value: E,
      }

      frame main() ret int {
        local neg: float = -1.0 * 0.0;
        local a: Box = Box { value: E.V(0.0) };
        local b: Box = Box { value: E.V(neg) };

        if (a == b) {
          printf("equal\\n");
        } else {
          printf("not equal\\n");
        }

        return 0;
      }
    `);

    expect(output).toBe("equal\n");
  });

  it("compares array fields element-wise without padding bytes", () => {
    const output = compileAndRun(`
      extern printf(fmt: string, ...) ret int;

      struct Wide {
        tag: i8,
        value: long,
      }

      struct Box {
        values: Wide[1],
      }

      frame make(tag: i8, value: long) ret Wide[1] {
        local filler: long[3] = [value, value + 1, value + 2];
        if (value < 0) {
          printf("%ld", filler[0]);
        }
        return [Wide { tag: tag, value: value }];
      }

      frame main() ret int {
        local a: Box = Box { values: make(3, 4294967296) };
        local b: Box = Box { values: make(3, 4294967296) };

        if (a == b) {
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
