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
  });
});
