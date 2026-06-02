import { describe, expect, it } from "bun:test";
import { compileAndRun } from "./helpers/compileAndRun";

describe("BUG-082: Tuple Equality Fix", () => {
  describe("Tuple equality with floats", () => {
    it("should compare tuples with float elements correctly", () => {
      const code = `
        extern printf(fmt: string, ...) ret int;
        frame main() ret int {
          local t1: (int, float) = (1, 3.14);
          local t2: (int, float) = (1, 3.14);
          if (t1 == t2) {
            printf("equal\\n");
          } else {
            printf("not equal\\n");
          }
          return 0;
        }
      `;
      const result = compileAndRun(code);
      expect(result.trim()).toBe("equal");
    });

    it("should detect inequality in float tuples", () => {
      const code = `
        extern printf(fmt: string, ...) ret int;
        frame main() ret int {
          local t1: (float, float) = (1.0, 2.0);
          local t2: (float, float) = (1.0, 2.5);
          if (t1 != t2) {
            printf("different\\n");
          }
          return 0;
        }
      `;
      const result = compileAndRun(code);
      expect(result.trim()).toBe("different");
    });

    it("should handle pure float tuples", () => {
      const code = `
        extern printf(fmt: string, ...) ret int;
        frame main() ret int {
          local a: (float, float, float) = (1.1, 2.2, 3.3);
          local b: (float, float, float) = (1.1, 2.2, 3.3);
          if (a == b) {
            printf("match\\n");
          }
          return 0;
        }
      `;
      const result = compileAndRun(code);
      expect(result.trim()).toBe("match");
    });
  });

  describe("Tuple equality with integers", () => {
    it("should compare int tuples correctly", () => {
      const code = `
        extern printf(fmt: string, ...) ret int;
        frame main() ret int {
          local t1: (int, int) = (10, 20);
          local t2: (int, int) = (10, 20);
          local t3: (int, int) = (10, 21);
          if (t1 == t2) { printf("t1==t2\\n"); }
          if (t1 != t3) { printf("t1!=t3\\n"); }
          return 0;
        }
      `;
      const result = compileAndRun(code);
      expect(result).toContain("t1==t2");
      expect(result).toContain("t1!=t3");
    });
  });

  describe("Mixed type tuple equality", () => {
    it("should compare mixed int/float/bool tuples", () => {
      const code = `
        extern printf(fmt: string, ...) ret int;
        frame main() ret int {
          local t1: (int, float, bool) = (42, 3.14, true);
          local t2: (int, float, bool) = (42, 3.14, true);
          local t3: (int, float, bool) = (42, 3.14, false);
          if (t1 == t2) { printf("eq\\n"); }
          if (t1 != t3) { printf("neq\\n"); }
          return 0;
        }
      `;
      const result = compileAndRun(code);
      expect(result).toContain("eq");
      expect(result).toContain("neq");
    });

    it("should compare aggregate tuple elements semantically", () => {
      const code = `
        extern printf(fmt: string, ...) ret int;

        struct Wide {
          tag: i8,
          value: long,
        }

        enum Marker {
          Value(float),
        }

        frame make(tag: i8, value: long) ret Wide[1] {
          local filler: long[3] = [value, value + 1, value + 2];
          if (value < 0) {
            printf("%ld", filler[0]);
          }
          return [Wide { tag: tag, value: value }];
        }

        frame main() ret int {
          local neg: float = -1.0 * 0.0;
          local left: (Wide[1], Marker) = (make(7, 4294967296), Marker.Value(0.0));
          local right: (Wide[1], Marker) = (make(7, 4294967296), Marker.Value(neg));

          if (left == right) {
            printf("equal\\n");
          } else {
            printf("not equal\\n");
          }

          return 0;
        }
      `;

      const result = compileAndRun(code);
      expect(result.trim()).toBe("equal");
    });

    it("should compare tuple fields semantically inside structs", () => {
      const code = `
        extern printf(fmt: string, ...) ret int;

        enum Marker {
          Value(float),
        }

        struct Box {
          pair: (int, Marker),
        }

        frame main() ret int {
          local neg: float = -1.0 * 0.0;
          local left: Box = Box { pair: (42, Marker.Value(0.0)) };
          local right: Box = Box { pair: (42, Marker.Value(neg)) };

          if (left == right) {
            printf("equal\\n");
          } else {
            printf("not equal\\n");
          }

          return 0;
        }
      `;

      const result = compileAndRun(code);
      expect(result.trim()).toBe("equal");
    });
  });
});
