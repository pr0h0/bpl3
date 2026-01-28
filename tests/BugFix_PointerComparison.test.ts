import { describe, expect, it } from "bun:test";
import { compileAndRun } from "./helpers/compileAndRun";

describe("BUG-114: Pointer Comparison Fix", () => {
  describe("Pointer vs nullptr comparisons", () => {
    it("should compare simple pointer to nullptr with !=", () => {
      const code = `
        extern printf(fmt: string, ...) ret int;
        extern malloc(size: long) ret *void;
        frame main() ret int {
          local ptr: *int = cast<*int>(malloc(8));
          if (ptr != nullptr) {
            printf("not null\\n");
          }
          return 0;
        }
      `;
      const result = compileAndRun(code);
      expect(result).toContain("not null");
    });

    it("should compare nullptr to pointer (reversed order)", () => {
      const code = `
        extern printf(fmt: string, ...) ret int;
        frame main() ret int {
          local ptr: *int = nullptr;
          if (nullptr == ptr) {
            printf("is null\\n");
          }
          return 0;
        }
      `;
      const result = compileAndRun(code);
      expect(result).toContain("is null");
    });
  });

  describe("Pointer identity comparisons", () => {
    it("should compare two pointers pointing to same address", () => {
      const code = `
        extern printf(fmt: string, ...) ret int;
        extern malloc(size: long) ret *void;
        frame main() ret int {
          local p1: *int = cast<*int>(malloc(8));
          local p2: *int = p1;
          if (p1 == p2) {
            printf("same\\n");
          }
          return 0;
        }
      `;
      const result = compileAndRun(code);
      expect(result).toContain("same");
    });

    it("should compare two different pointers", () => {
      const code = `
        extern printf(fmt: string, ...) ret int;
        extern malloc(size: long) ret *void;
        frame main() ret int {
          local p1: *int = cast<*int>(malloc(8));
          local p2: *int = cast<*int>(malloc(8));
          if (p1 != p2) {
            printf("different\\n");
          }
          return 0;
        }
      `;
      const result = compileAndRun(code);
      expect(result).toContain("different");
    });
  });

  describe("Struct pointer comparisons (no vtable)", () => {
    it("should compare struct pointers with nullptr", () => {
      const code = `
        extern printf(fmt: string, ...) ret int;
        extern malloc(size: long) ret *void;
        struct Point { x: int, y: int }
        frame main() ret int {
          local p: *Point = cast<*Point>(malloc(sizeof<Point>()));
          if (p != nullptr) {
            printf("has point\\n");
          }
          local q: *Point = nullptr;
          if (q == nullptr) {
            printf("no point\\n");
          }
          return 0;
        }
      `;
      const result = compileAndRun(code);
      expect(result).toContain("has point");
      expect(result).toContain("no point");
    });

    it("should compare struct pointer identity", () => {
      const code = `
        extern printf(fmt: string, ...) ret int;
        extern malloc(size: long) ret *void;
        struct Point { x: int, y: int }
        frame main() ret int {
          local p1: *Point = cast<*Point>(malloc(sizeof<Point>()));
          local p2: *Point = cast<*Point>(malloc(sizeof<Point>()));
          local p3: *Point = p1;
          if (p1 == p3) { printf("p1 == p3\\n"); }
          if (p1 != p2) { printf("p1 != p2\\n"); }
          return 0;
        }
      `;
      const result = compileAndRun(code);
      expect(result).toContain("p1 == p3");
      expect(result).toContain("p1 != p2");
    });
  });

  describe("Struct pointer comparisons (with vtable)", () => {
    it("should compare String pointers with nullptr", () => {
      const code = `
        import [String] from "std/string.bpl";
        extern printf(fmt: string, ...) ret int;
        extern malloc(size: long) ret *void;
        frame main() ret int {
          local s: *String = cast<*String>(malloc(sizeof<String>()));
          *s = String.new("test");
          if (s != nullptr) {
            printf("has string\\n");
          }
          s.destroy();
          return 0;
        }
      `;
      const result = compileAndRun(code);
      expect(result).toContain("has string");
    });

    it("should compare String pointer identity (not value)", () => {
      const code = `
        import [String] from "std/string.bpl";
        extern printf(fmt: string, ...) ret int;
        extern malloc(size: long) ret *void;
        frame main() ret int {
          local s1: *String = cast<*String>(malloc(sizeof<String>()));
          local s2: *String = cast<*String>(malloc(sizeof<String>()));
          *s1 = String.new("hello");
          *s2 = String.new("hello");
          # Pointer identity - different allocations
          if (s1 != s2) { printf("ptr different\\n"); }
          # Value equality - same content
          if (*s1 == *s2) { printf("value same\\n"); }
          s1.destroy();
          s2.destroy();
          return 0;
        }
      `;
      const result = compileAndRun(code);
      expect(result).toContain("ptr different");
      expect(result).toContain("value same");
    });
  });
});
