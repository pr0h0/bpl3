import { describe, expect, it } from "bun:test";

import {
  compileAndRun,
  compileAndRunFull,
  getCompilationErrors,
} from "./helpers";

describe("v0.1 Stability Edge Cases", () => {
  describe("Runtime Semantics", () => {
    it("short-circuits logical operators without evaluating skipped branches", () => {
      const output = compileAndRun(`
        extern printf(fmt: string, ...) ret int;

        frame side_effect() ret bool {
          printf("side-effect\\n");
          return true;
        }

        frame main() ret int {
          if (false && side_effect()) {
            printf("bad-and\\n");
          }

          if (true || side_effect()) {
            printf("ok\\n");
          }

          return 0;
        }
      `);

      expect(output).toBe("ok\n");
    });

    it("evaluates only the selected ternary branch", () => {
      const output = compileAndRun(`
        extern printf(fmt: string, ...) ret int;

        frame cold_path() ret int {
          printf("cold\\n");
          return 99;
        }

        frame main() ret int {
          local a: int = true ? 7 : cold_path();
          local b: int = false ? cold_path() : 11;
          printf("%d %d\\n", a, b);
          return 0;
        }
      `);

      expect(output).toBe("7 11\n");
    });

    it("keeps struct arguments value-copied across nested calls", () => {
      const output = compileAndRun(`
        extern printf(fmt: string, ...) ret int;

        struct Pair {
          left: int,
          right: int,
        }

        frame mutate_copy(p: Pair) ret int {
          p.left = 100;
          return p.left + p.right;
        }

        frame main() ret int {
          local p: Pair = Pair { left: 3, right: 4 };
          printf("%d\\n", mutate_copy(p));
          printf("%d %d\\n", p.left, p.right);
          return 0;
        }
      `);

      expect(output).toBe("104\n3 4\n");
    });

    it("mutates through explicit pointer parameters", () => {
      const output = compileAndRun(`
        extern printf(fmt: string, ...) ret int;

        frame set_value(slot: *int, value: int) {
          *slot = value;
        }

        frame main() ret int {
          local x: int = 5;
          set_value(&x, 42);
          printf("%d\\n", x);
          return 0;
        }
      `);

      expect(output).toBe("42\n");
    });

    it("indexes through pointers derived from fixed arrays", () => {
      const output = compileAndRun(`
        extern printf(fmt: string, ...) ret int;

        frame main() ret int {
          local values: int[4];
          values[0] = 2;
          values[1] = 3;
          values[2] = 5;
          values[3] = 7;

          local p: *int = &values[0];
          printf("%d %d %d\\n", p[0], p[2], values[3]);
          return 0;
        }
      `);

      expect(output).toBe("2 5 7\n");
    });

    it("passes function pointers stored in structs", () => {
      const output = compileAndRun(`
        extern printf(fmt: string, ...) ret int;

        type Binary = Func<int>(int, int);

        struct Slot {
          op: Binary,
        }

        frame add(a: int, b: int) ret int {
          return a + b;
        }

        frame mul(a: int, b: int) ret int {
          return a * b;
        }

        frame apply(slot: Slot, a: int, b: int) ret int {
          return slot.op(a, b);
        }

        frame main() ret int {
          local slot: Slot;
          slot.op = add;
          printf("%d\\n", apply(slot, 10, 7));
          slot.op = mul;
          printf("%d\\n", apply(slot, 6, 7));
          return 0;
        }
      `);

      expect(output).toBe("17\n42\n");
    });

    it("returns and consumes generic structs without runtime tag overhead", () => {
      const output = compileAndRun(`
        extern printf(fmt: string, ...) ret int;

        struct Box<T> {
          value: T,
        }

        frame makeBox<T>(value: T) ret Box<T> {
          return Box<T> { value: value };
        }

        frame unwrap<T>(box: Box<T>) ret T {
          return box.value;
        }

        frame main() ret int {
          local box: Box<int> = makeBox<int>(21);
          printf("%d\\n", unwrap<int>(box) * 2);
          return 0;
        }
      `);

      expect(output).toBe("42\n");
    });

    it("combines tuple return values with destructuring", () => {
      const output = compileAndRun(`
        extern printf(fmt: string, ...) ret int;

        frame bounds(a: int, b: int) ret (int, int) {
          if (a < b) {
            return (a, b);
          }
          return (b, a);
        }

        frame main() ret int {
          local (lo: int, hi: int) = bounds(9, 4);
          printf("%d %d\\n", lo, hi);
          return 0;
        }
      `);

      expect(output).toBe("4 9\n");
    });

    it("matches enums through all variants", () => {
      const output = compileAndRun(`
        extern printf(fmt: string, ...) ret int;

        enum Color {
          Red,
          Green,
          Blue,
        }

        frame score(c: Color) ret int {
          return match (c) {
            Color.Red => 10,
            Color.Green => 20,
            Color.Blue => 30,
          };
        }

        frame main() ret int {
          printf("%d %d %d\\n", score(Color.Red), score(Color.Green), score(Color.Blue));
          return 0;
        }
      `);

      expect(output).toBe("10 20 30\n");
    });

    it("matches primitive guards with bound values", () => {
      const output = compileAndRun(`
        extern printf(fmt: string, ...) ret int;

        frame classify(value: int) ret int {
          return match (value) {
            n if n > 0 => 1,
            0 => 0,
            _ => -1,
          };
        }

        frame main() ret int {
          printf("%d %d %d\\n", classify(5), classify(0), classify(-2));
          return 0;
        }
      `);

      expect(output).toBe("1 0 -1\n");
    });

    it("keeps nested lambda capture values callable after return", () => {
      const output = compileAndRun(`
        extern printf(fmt: string, ...) ret int;

        frame makeAdder(base: int) ret Lambda<int>(int) {
          return |value: int| ret int {
            return base + value;
          };
        }

        frame main() ret int {
          local add10: Lambda<int>(int) = makeAdder(10);
          printf("%d\\n", add10(32));
          return 0;
        }
      `);

      expect(output).toBe("42\n");
    });

    it("handles nested fixed arrays inside structs", () => {
      const output = compileAndRun(`
        extern printf(fmt: string, ...) ret int;

        struct Row {
          cells: int[3],
        }

        struct Matrix {
          rows: Row[2],
        }

        frame main() ret int {
          local matrix: Matrix;
          matrix.rows[0].cells[0] = 1;
          matrix.rows[0].cells[1] = 2;
          matrix.rows[0].cells[2] = 3;
          matrix.rows[1].cells[0] = 4;
          matrix.rows[1].cells[1] = 5;
          matrix.rows[1].cells[2] = 6;

          printf("%d %d\\n", matrix.rows[0].cells[2], matrix.rows[1].cells[1]);
          return 0;
        }
      `);

      expect(output).toBe("3 5\n");
    });

    it("traps fixed array out-of-bounds reads at runtime", () => {
      const result = compileAndRunFull(`
        extern printf(fmt: string, ...) ret int;

        frame main() ret int {
          local values: int[2];
          values[0] = 1;
          values[1] = 2;
          printf("%d\\n", values[2]);
          return 0;
        }
      `);

      expect(result.exitCode).not.toBe(0);
      expect((result.stderr + result.stdout).toUpperCase()).toContain(
        "INDEX OUT OF BOUNDS",
      );
    });
  });

  describe("Diagnostic Stability", () => {
    it("rejects non-bool loop conditions without crashing", () => {
      const errors = getCompilationErrors(`
        frame main() ret int {
          loop (1) {
            return 1;
          }
          return 0;
        }
      `);

      expect(errors.join("\n").toLowerCase()).toContain("boolean");
    });

    it("rejects duplicate function parameter names", () => {
      const result = compileAndRunFull(`
        frame add(a: int, a: int) ret int {
          return a;
        }

        frame main() ret int {
          return add(1, 2);
        }
      `);

      expect(result.exitCode).not.toBe(0);
      expect((result.stderr + result.stdout).toLowerCase()).toContain(
        "duplicate",
      );
    });

    it("rejects invalid array literal element types", () => {
      const errors = getCompilationErrors(`
        frame main() ret int {
          local values: int[] = [1, "two", 3];
          return values[0];
        }
      `);

      expect(errors.join("\n").toLowerCase()).toContain("inconsistent");
    });

    it("rejects calling non-callable values", () => {
      const result = compileAndRunFull(`
        frame main() ret int {
          local value: int = 10;
          return value(1);
        }
      `);

      expect(result.exitCode).not.toBe(0);
      expect((result.stderr + result.stdout).toLowerCase()).toContain(
        "not callable",
      );
    });

    it("rejects duplicate struct fields", () => {
      const result = compileAndRunFull(`
        struct Point {
          x: int,
          x: int,
        }

        frame main() ret int {
          return 0;
        }
      `);

      expect(result.exitCode).not.toBe(0);
      expect((result.stderr + result.stdout).toLowerCase()).toContain(
        "duplicate field",
      );
    });

    it("rejects unreachable code after return", () => {
      const result = compileAndRunFull(`
        frame main() ret int {
          return 1;
          local value: int = 2;
          return value;
        }
      `);

      expect(result.exitCode).not.toBe(0);
      expect((result.stderr + result.stdout).toLowerCase()).toContain(
        "unreachable code",
      );
    });
  });
});
