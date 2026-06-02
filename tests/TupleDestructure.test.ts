import { describe, expect, it } from "bun:test";
import { compileAndRun } from "./helpers/compileAndRun";

describe("Tuple Destructuring", () => {
  describe("Basic tuple destructuring", () => {
    it("should destructure a simple pair with type annotations", () => {
      const code = `
        extern printf(fmt: string, ...) ret int;
        frame main() ret int {
          local t: (int, int) = (10, 20);
          local (a: int, b: int) = t;
          printf("%d %d\\n", a, b);
          return 0;
        }
      `;
      const result = compileAndRun(code);
      expect(result.trim()).toBe("10 20");
    });

    it("should destructure a triple with type annotations", () => {
      const code = `
        extern printf(fmt: string, ...) ret int;
        frame main() ret int {
          local t: (int, int, int) = (1, 2, 3);
          local (x: int, y: int, z: int) = t;
          printf("%d %d %d\\n", x, y, z);
          return 0;
        }
      `;
      const result = compileAndRun(code);
      expect(result.trim()).toBe("1 2 3");
    });

    it("should destructure mixed types with type annotations", () => {
      const code = `
        extern printf(fmt: string, ...) ret int;
        frame main() ret int {
          local t: (int, float, bool) = (42, 3.14, true);
          local (num: int, pi: float, flag: bool) = t;
          printf("%d %.2f %d\\n", num, pi, cast<int>(flag));
          return 0;
        }
      `;
      const result = compileAndRun(code);
      expect(result.trim()).toBe("42 3.14 1");
    });

    it("should cast compatible integer elements to narrower target types", () => {
      const code = `
        extern printf(fmt: string, ...) ret int;
        frame main() ret int {
          local pair: (int, int) = (1, 2);
          local (left: i8, right: i8) = pair;
          printf("%d %d\\n", cast<int>(left), cast<int>(right));
          return 0;
        }
      `;
      const result = compileAndRun(code);
      expect(result.trim()).toBe("1 2");
    });

    it("should cast compatible tuple literal elements to the annotated tuple type", () => {
      const code = `
        extern printf(fmt: string, ...) ret int;
        frame main() ret int {
          local pair: (i8, long) = (3, 4294967296);
          printf("%d %ld\\n", cast<int>(pair.0), pair.1);
          return 0;
        }
      `;
      const result = compileAndRun(code);
      expect(result.trim()).toBe("3 4294967296");
    });

    it("should cast compatible tuple value elements to the annotated tuple type", () => {
      const code = `
        extern printf(fmt: string, ...) ret int;
        frame main() ret int {
          local source: (int, long) = (3, 4294967296);
          local pair: (i8, long) = source;
          printf("%d %ld\\n", cast<int>(pair.0), pair.1);
          return 0;
        }
      `;
      const result = compileAndRun(code);
      expect(result.trim()).toBe("3 4294967296");
    });
  });

  describe("Nested tuple destructuring", () => {
    it("should destructure nested tuple (outer level)", () => {
      const code = `
        extern printf(fmt: string, ...) ret int;
        frame main() ret int {
          local nested: ((int, int), int) = ((100, 200), 300);
          local (inner: (int, int), outer: int) = nested;
          printf("%d %d %d\\n", inner.0, inner.1, outer);
          return 0;
        }
      `;
      const result = compileAndRun(code);
      expect(result.trim()).toBe("100 200 300");
    });

    it("should handle deeply nested tuples step by step", () => {
      const code = `
        extern printf(fmt: string, ...) ret int;
        frame main() ret int {
          local deep: (int, (int, (int, int))) = (1, (2, (3, 4)));
          local (d1: int, rest: (int, (int, int))) = deep;
          local (d2: int, innermost: (int, int)) = rest;
          local (d3: int, d4: int) = innermost;
          printf("%d %d %d %d\\n", d1, d2, d3, d4);
          return 0;
        }
      `;
      const result = compileAndRun(code);
      expect(result.trim()).toBe("1 2 3 4");
    });

    it("should destructure tuple from function return", () => {
      const code = `
        extern printf(fmt: string, ...) ret int;
        frame getMinMax(a: int, b: int) ret (int, int) {
          if (a < b) { return (a, b); }
          return (b, a);
        }
        frame main() ret int {
          local (min: int, max: int) = getMinMax(10, 5);
          printf("%d %d\\n", min, max);
          return 0;
        }
      `;
      const result = compileAndRun(code);
      expect(result.trim()).toBe("5 10");
    });

    it("should cast compatible tuple return literal elements to the declared return type", () => {
      const code = `
        extern printf(fmt: string, ...) ret int;
        frame getPair() ret (i8, long) {
          return (3, 4294967296);
        }
        frame main() ret int {
          local pair: (i8, long) = getPair();
          printf("%d %ld\\n", cast<int>(pair.0), pair.1);
          return 0;
        }
      `;
      const result = compileAndRun(code);
      expect(result.trim()).toBe("3 4294967296");
    });
  });

  describe("Tuple swap pattern", () => {
    it("should swap values using tuple destructuring", () => {
      const code = `
        extern printf(fmt: string, ...) ret int;
        frame main() ret int {
          local a: int = 100;
          local b: int = 200;
          local (newA: int, newB: int) = (b, a);
          printf("%d %d\\n", newA, newB);
          return 0;
        }
      `;
      const result = compileAndRun(code);
      expect(result.trim()).toBe("200 100");
    });

    it("should cast compatible integer assignment elements to narrower targets", () => {
      const code = `
        extern printf(fmt: string, ...) ret int;
        frame main() ret int {
          local left: i8 = 0;
          local right: i8 = 0;
          local pair: (int, int) = (3, 4);
          (left, right) = pair;
          printf("%d %d\\n", cast<int>(left), cast<int>(right));
          return 0;
        }
      `;
      const result = compileAndRun(code);
      expect(result.trim()).toBe("3 4");
    });

    it("should cast compatible tuple assignment literal elements to the target tuple type", () => {
      const code = `
        extern printf(fmt: string, ...) ret int;
        frame main() ret int {
          local pair: (i8, long) = (0, 0);
          pair = (3, 4294967296);
          printf("%d %ld\\n", cast<int>(pair.0), pair.1);
          return 0;
        }
      `;
      const result = compileAndRun(code);
      expect(result.trim()).toBe("3 4294967296");
    });
  });

  describe("Tuple element access", () => {
    it("should cast compatible tuple argument literal elements to the parameter type", () => {
      const code = `
        extern printf(fmt: string, ...) ret int;
        frame printPair(pair: (i8, long)) ret void {
          printf("%d %ld\\n", cast<int>(pair.0), pair.1);
        }
        frame main() ret int {
          printPair((3, 4294967296));
          return 0;
        }
      `;
      const result = compileAndRun(code);
      expect(result.trim()).toBe("3 4294967296");
    });

    it("should access tuple elements with .0, .1, etc", () => {
      const code = `
        extern printf(fmt: string, ...) ret int;
        frame main() ret int {
          local t: (int, int, int) = (10, 20, 30);
          printf("%d %d %d\\n", t.0, t.1, t.2);
          return 0;
        }
      `;
      const result = compileAndRun(code);
      expect(result.trim()).toBe("10 20 30");
    });

    it("should access nested tuple elements", () => {
      const code = `
        extern printf(fmt: string, ...) ret int;
        frame main() ret int {
          local t: ((int, int), int) = ((5, 6), 7);
          printf("%d %d %d\\n", t.0.0, t.0.1, t.1);
          return 0;
        }
      `;
      const result = compileAndRun(code);
      expect(result.trim()).toBe("5 6 7");
    });
  });
});
