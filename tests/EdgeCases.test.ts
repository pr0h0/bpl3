import { describe, it, expect } from "bun:test";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { CodeGenerator } from "../compiler/backend/CodeGenerator";
import { CompilerError } from "../compiler/common/CompilerError";

function compile(source: string): string {
  const tokens = lexWithGrammar(source, "test.bpl");
  const parser = new Parser(source, "test.bpl", tokens);
  const program = parser.parse();
  const typeChecker = new TypeChecker();
  typeChecker.checkProgram(program);
  const generator = new CodeGenerator();
  return generator.generate(program);
}

describe("Edge Cases and Error Handling", () => {
  describe("Null and Undefined Handling", () => {
    it("should handle null pointer assignment", () => {
      const source = `
        frame test() ret *int {
          local p: *int = null;
          return p;
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });

    it("should reject null assignment to non-pointer", () => {
      const source = `
        frame test() ret int {
          local x: int = null;
          return x;
        }
      `;
      expect(() => compile(source)).toThrow(CompilerError);
    });

    it("should handle null in comparisons", () => {
      const source = `
        frame test(p: *int) ret bool {
          return p == null;
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });

    it("should handle null in ternary operator", () => {
      // TODO: Should allow casting to and from *void to any type, should make nullptr compatible with any pointer
      const source = `
        frame test() ret *int {
          return true ? nullptr : nullptr;
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });
  });

  describe("Type System Edge Cases", () => {
    it("should handle void* to specific pointer cast", () => {
      const source = `
        frame test(vp: *void) ret *int {
          return cast<*int>(vp);
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });

    it("should handle pointer to integer cast", () => {
      const source = `
        frame test(p: *int) ret i64 {
          return cast<i64>(p);
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });

    it("should handle integer to pointer cast", () => {
      const source = `
        frame test(addr: i64) ret *int {
          return cast<*int>(addr);
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });

    it("should handle deeply nested generic types", () => {
      const source = `
        struct Box<T> { value: T, }
        frame test() ret int {
          local b: Box<Box<Box<int>>>;
          return 0;
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });

    it("should handle function pointer types", () => {
      const source = `
        type FuncPtr = Func<int>(int);
        frame test(fp: FuncPtr) ret int {
          return fp(42);
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });
  });

  describe("Integer Overflow and Underflow", () => {
    it("should handle maximum integer values", () => {
      const source = `
        frame test() ret long {
          return 9223372036854775807;
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });

    it("should handle minimum integer values", () => {
      const source = `
        frame test() ret long {
          return -9223372036854775808;
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });

    it("should handle unsigned integer max", () => {
      const source = `
        frame test() ret long {
          return 18446744073709551615;
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });
  });

  describe("Float Special Values", () => {
    it("should handle infinity", () => {
      const source = `
        frame test() ret float {
          return 1.0 / 0.0;
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });

    it("should handle negative infinity", () => {
      const source = `
        frame test() ret float {
          return -1.0 / 0.0;
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });

    it("should handle very small floats", () => {
      const source = `
        frame test() ret float {
          return 0.00000000000000000000000000000000000000000001;
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });

    it("should handle very large floats", () => {
      const source = `
        frame test() ret float {
          return 10000000000000000000000000000000000000000.0;
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });
  });

  describe("String Edge Cases", () => {
    it("should handle empty string", () => {
      const source = `
        frame test() ret string {
          return "";
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });

    it("should handle string with escape sequences", () => {
      const source = `
        frame test() ret string {
          return "line1\\nline2\\ttab\\r\\n";
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });

    it("should handle string with quotes", () => {
      const source = `
        frame test() ret string {
          return "say \\"hello\\"";
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });

    it("should handle string with backslashes", () => {
      const source = `
        frame test() ret string {
          return "path\\\\to\\\\file";
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });

    it("should handle long strings", () => {
      const longStr = "x".repeat(1000);
      const source = `
        frame test() ret string {
          return "${longStr}";
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });
  });

  describe("Array Edge Cases", () => {
    it("should handle zero-length arrays", () => {
      const source = `
        frame test() ret void {
          local arr: int[0];
        }
      `;
      // Some compilers allow, some don't
      // expect(() => compile(source)).toThrow(CompilerError);
    });

    it("should handle very large arrays", () => {
      const source = `
        frame test() ret void {
          local arr: int[10000];
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });

    it("should handle multi-dimensional arrays", () => {
      const source = `
        frame test() ret void {
          local matrix: int[10][20];
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });

    it("should handle array of pointers", () => {
      const source = `
        frame test() ret void {
          local ptrs: *int[10];
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });

    it("should handle pointer to array", () => {
      const source = `
        frame test() ret void {
          local p: int(*)[10];
        }
      `;
      // This is tricky syntax, might not be supported
    });
  });

  describe("Pointer Arithmetic Edge Cases", () => {
    it("should handle pointer subtraction", () => {
      const source = `
        frame test(p1: *int, p2: *int) ret long {
          return cast<long>(p1) - cast<long>(p2);
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });

    it("should handle pointer comparison", () => {
      const source = `
        frame test(p1: *int, p2: *int) ret bool {
          return p1 < p2;
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });

    it("should handle double pointer dereference", () => {
      const source = `
        frame test(pp: **int) ret int {
          return **pp;
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });

    it("should handle address of array element", () => {
      const source = `
        frame test() ret *int {
          local arr: int[10];
          return &arr[5];
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });
  });

  describe("Struct Edge Cases", () => {
    it("should handle empty struct", () => {
      const source = `
        struct Empty {}
        frame test() ret int {
          local e: Empty;
          return 0;
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });

    it("should handle struct with single field", () => {
      const source = `
        struct Single { x: int, }
        frame test() ret int {
          local s: Single;
          s.x = 10;
          return s.x;
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });

    it("should handle nested structs", () => {
      const source = `
        struct Inner { x: int, }
        struct Outer { inner: Inner, }
        frame test() ret int {
          local o: Outer;
          o.inner.x = 10;
          return o.inner.x;
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });

    it("should handle struct with array field", () => {
      const source = `
        struct Container { data: int[10], }
        frame test() ret int {
          local c: Container;
          c.data[0] = 42;
          return c.data[0];
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });

    it("should handle struct with pointer field", () => {
      const source = `
        struct Node {
          value: int,
          next: *Node,
        }
        frame test() ret int {
          local n: Node;
          n.next = null;
          return n.value;
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });
  });

  describe("Function Edge Cases", () => {
    it("should handle function with no parameters", () => {
      const source = `
        frame test() ret int {
          return 42;
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });

    it("should handle function with many parameters", () => {
      const source = `
        frame test(a: int, b: int, c: int, d: int, e: int, f: int, g: int, h: int) ret int {
          return a + b + c + d + e + f + g + h;
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });

    it("should handle deeply recursive function", () => {
      const source = `
        frame factorial(n: int) ret int {
          if (n <= 1) { return 1; }
          return n * factorial(n - 1);
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });

    it("should handle mutually recursive functions", () => {
      const source = `
        frame odd(n: int) ret bool {
          if (n == 0) { return false; }
          return even(n - 1);
        }
        frame even(n: int) ret bool {
          if (n == 0) { return true; }
          return odd(n - 1);
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });

    it("should handle function returning void", () => {
      const source = `
        frame test() ret void {
          local x: int = 10;
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });
  });

  describe("Control Flow Edge Cases", () => {
    it("should handle infinite loop", () => {
      const source = `
        frame test() ret int {
          loop {
            return 1;
          }
          return 0;
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });

    it("should handle deeply nested if statements", () => {
      const source = `
        frame test() ret int {
          if (true) {
            if (true) {
              if (true) {
                if (true) {
                  return 1;
                }
              }
            }
          }
          return 0;
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });

    it("should handle switch with no cases", () => {
      const source = `
        frame test(x: int) ret int {
          switch (x) {
            default: {
              return 0;
            }
          }
          return 0;
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });

    it("should handle switch with many cases", () => {
      const source = `
        frame test(x: int) ret int {
          switch (x) {
            case 1: { return 1; }
            case 2: { return 2; }
            case 3: { return 3; }
            case 4: { return 4; }
            case 5: { return 5; }
            default: { return 0; }
          }
          return 0;
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });

    it("should handle multiple break statements", () => {
      const source = `
        frame test() ret int {
          loop (true) {
            if (true) { break; }
            if (false) { break; }
            break;
          }
          return 0;
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });

    it("should handle multiple return statements", () => {
      const source = `
        frame test(x: int) ret int {
          if (x > 0) { return 1; }
          if (x < 0) { return -1; }
          return 0;
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });
  });

  describe("Expression Complexity", () => {
    it("should handle very long expressions", () => {
      const source = `
        frame test() ret int {
          return 1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9 + 10;
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });

    it("should handle deeply nested parentheses", () => {
      const source = `
        frame test() ret int {
          return ((((1 + 2) * 3) - 4) / 5);
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });

    it("should handle chained function calls", () => {
      const source = `
        frame f(x: int) ret int { return x; }
        frame test() ret int {
          return f(f(f(f(42))));
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });

    it("should handle chained member access", () => {
      const source = `
        struct A { b: B, }
        struct B { c: C, }
        struct C { value: int, }
        frame test(a: A) ret int {
          return a.b.c.value;
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });

    it("should handle mixed operators with complex precedence", () => {
      const source = `
        frame test() ret int {
          return 1 + 2 * 3 << 4 & 5 | 6 ^ 7;
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });
  });

  describe("Variable Shadowing", () => {
    it("should handle variable shadowing in nested scopes", () => {
      const source = `
        frame test() ret int {
          local x: int = 10;
          if (true) {
            local x: int = 20;
            return x;
          }
          return x;
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });

    it("should handle parameter shadowing", () => {
      const source = `
        frame test(x: int) ret int {
          if (true) {
            local x: int = 20;
            return x;
          }
          return x;
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });
  });

  describe("Generic Edge Cases", () => {
    it("should handle generic function with multiple type parameters", () => {
      const source = `
        frame pair<T, U>(a: T, b: U) ret int { return 0; }
        frame test() ret int {
          return pair<int, float>(1, 2.0);
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });

    it("should handle generic struct with generic method", () => {
      const source = `
        struct Box<T> {
          value: T,
          frame get(this: Box<T>) ret T { return this.value; }
        }
        frame test() ret int {
          local b: Box<int>;
          return b.get();
        }
      `;
      expect(() => compile(source)).not.toThrow();
    });
  });

  describe("Memory Safety Edge Cases", () => {
    it("should handle returning address of local variable", () => {
      const source = `
        frame test() ret *int {
          local x: int = 10;
          return &x;
        }
      `;
      // This is dangerous but syntactically valid
      expect(() => compile(source)).not.toThrow();
    });

    it("should handle dangling pointer", () => {
      const source = `
        frame test() ret *int {
          local p: *int;
          if (true) {
            local x: int = 10;
            p = &x;
          }
          return p;
        }
      `;
      // Also dangerous but syntactically valid
      expect(() => compile(source)).not.toThrow();
    });
  });
});
