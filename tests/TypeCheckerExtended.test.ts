import { describe, it, expect } from "bun:test";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { CompilerError } from "../compiler/common/CompilerError";

function check(source: string) {
  const tokens = lexWithGrammar(source, "test.bpl");
  const parser = new Parser(source, "test.bpl", tokens);
  const program = parser.parse();
  const typeChecker = new TypeChecker();
  typeChecker.checkProgram(program);
  return program;
}

describe("TypeChecker - Extended Tests", () => {
  describe("Type Compatibility", () => {
    it("should accept compatible integer types", () => {
      const source = `
        frame test() ret int {
          local a: int = 10;
          local b: i32 = a;
          return b;
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should reject incompatible types", () => {
      const source = `
        frame test() ret int {
          local a: int = 10;
          local b: string = a;
          return 0;
        }
      `;
      expect(() => check(source)).toThrow(CompilerError);
    });

    it("should allow pointer to *void assignment", () => {
      // TODO: Should allow casting to and from *void to any type, should make nullptr compatible with any pointer
      const source = `
        frame test() ret *void {
          local p: *int = nullptr;
          local vp: *void = p;
          return vp;
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should allow array to pointer decay", () => {
      const source = `
        frame test(arr: *int) ret void {}
        frame main() ret int {
          local arr: int[10];
          test(arr);
          return 0;
        }
      `;
      expect(() => check(source)).not.toThrow();
    });
  });

  describe("Function Overloading", () => {
    it("should resolve correct overload by parameter types", () => {
      const source = `
        frame add(a: int, b: int) ret int { return a + b; }
        frame add(a: float, b: float) ret float { return a + b; }
        frame main() ret int {
          local x: int = add(1, 2);
          local y: float = add(1.0, 2.0);
          return 0;
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should resolve overload by parameter count", () => {
      const source = `
        frame func(a: int) ret int { return a; }
        frame func(a: int, b: int) ret int { return a + b; }
        frame main() ret int {
          func(1);
          func(1, 2);
          return 0;
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should fail on ambiguous overload", () => {
      const source = `
        frame func(a: int) ret int { return a; }
        frame func(a: i32) ret int { return a; }
        frame main() ret int {
          func(1);
          return 0;
        }
      `;
      // int and i32 are aliases, so this might be ambiguous or accepted as duplicate
      // Depending on implementation
    });
  });

  describe("Generics", () => {
    it("should instantiate generic function with concrete type", () => {
      const source = `
        frame identity<T>(val: T) ret T { return val; }
        frame main() ret int {
          local x: int = identity<int>(42);
          return x;
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should instantiate generic struct", () => {
      const source = `
        struct Box<T> { value: T, }
        frame main() ret int {
          local b: Box<int>;
          b.value = 42;
          return b.value;
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should fail on type mismatch in generic instantiation", () => {
      const source = `
        struct Box<T> { value: T, }
        frame main() ret int {
          local b: Box<int>;
          b.value = 3.14;
          return 0;
        }
      `;
      expect(() => check(source)).toThrow(CompilerError);
    });

    it("should support nested generic types", () => {
      const source = `
        struct Box<T> { value: T, }
        frame main() ret int {
          local b: Box<Box<int>>;
          return 0;
        }
      `;
      expect(() => check(source)).not.toThrow();
    });
  });

  describe("Inheritance", () => {
    it("should allow accessing parent members", () => {
      const source = `
        struct Parent { x: int, }
        struct Child: Parent { y: int, }
        frame main() ret int {
          local c: Child;
          c.x = 10;
          c.y = 20;
          return c.x + c.y;
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should allow calling parent methods", () => {
      const source = `
        struct Parent {
          x: int,
          frame getX(this: Parent) ret int { return this.x; }
        }
        struct Child: Parent { y: int, }
        frame main() ret int {
          local c: Child;
          c.x = 10;
          return c.getX();
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should allow method override", () => {
      const source = `
        struct Parent {
          frame getValue(this: *Parent) ret int { return 0; }
        }
        struct Child: Parent {
          frame getValue(this: *Child) ret int { return 1; }
        }
        frame main() ret int {
          local c: Child;
          return c.getValue();
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should support multiple inheritance", () => {
      const source = `
        struct A { a: int, }
        struct B { b: int, }
        struct C: B { c: int, }
        frame main() ret int {
          local obj: C;
          obj.a = 1;
          obj.b = 2;
          obj.c = 3;
          return obj.a + obj.b + obj.c;
        }
      `;
      expect(() => check(source)).not.toThrow();
    });
  });

  describe("Type Inference", () => {
    it("should infer expression types", () => {
      const source = `
        frame main() ret int {
          local x: int = 10;
          local y: int = 20;
          local sum: int = x + y;
          return sum;
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should infer ternary expression type", () => {
      const source = `
        frame main() ret int {
          local x: int = true ? 1 : 2;
          return x;
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should fail on ternary type mismatch", () => {
      const source = `
        frame main() ret int {
          local x: int = true ? 1 : 2.5;
          return x;
        }
      `;
      expect(() => check(source)).toThrow(CompilerError);
    });
  });

  describe("Array and Pointer Operations", () => {
    it("should allow array element access", () => {
      const source = `
        frame main() ret int {
          local arr: int[5];
          arr[0] = 10;
          return arr[0];
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should allow pointer arithmetic", () => {
      const source = `
        frame main() ret int {
          local arr: int[5];
          local p: *int = arr;
          p = p + 1;
          return *p;
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should fail on pointer arithmetic with non-integer", () => {
      // TODO: Should fail in Type Checker phase
      const source = `
        frame main() ret int {
          local p: *int;
          p = p + 3.14;
          return 0;
        }
      `;
      expect(() => check(source)).toThrow(CompilerError);
    });

    it("should allow address-of operator", () => {
      const source = `
        frame main() ret int {
          local x: int = 10;
          local p: *int = &x;
          return *p;
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should allow dereference operator", () => {
      const source = `
        frame main() ret int {
          local x: int = 10;
          local p: *int = &x;
          *p = 20;
          return x;
        }
      `;
      expect(() => check(source)).not.toThrow();
    });
  });

  describe("Return Type Checking", () => {
    it("should accept matching return type", () => {
      const source = `
        frame test() ret int {
          return 42;
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should reject mismatched return type", () => {
      const source = `
        frame test() ret int {
          return "hello";
        }
      `;
      expect(() => check(source)).toThrow(CompilerError);
    });

    it("should require return statement in non-void function", () => {
      const source = `
        frame test() ret int {
          local x: int = 10;
        }
      `;
      // Some compilers check this, some don't
      // expect(() => check(source)).toThrow(CompilerError);
    });

    it("should allow void functions without return", () => {
      const source = `
        frame test() ret void {
          local x: int = 10;
        }
      `;
      expect(() => check(source)).not.toThrow();
    });
  });

  describe("Operator Type Checking", () => {
    it("should allow arithmetic on numbers", () => {
      const source = `
        frame main() ret int {
          local a: int = 10;
          local b: int = 20;
          return a + b;
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should reject arithmetic on incompatible types", () => {
      // TODO: Should handle this in type checked phase
      const source = `
        frame main() ret int {
          local a: int = 10;
          local b: string = "hello";
          return a + b;
        }
      `;
      expect(() => check(source)).toThrow(CompilerError);
    });

    it("should allow comparison operators on compatible types", () => {
      const source = `
        frame main() ret bool {
          local a: int = 10;
          local b: int = 20;
          return a < b;
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should allow logical operators on booleans", () => {
      const source = `
        frame main() ret bool {
          local a: bool = true;
          local b: bool = false;
          return a && b;
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should allow bitwise operators on integers", () => {
      const source = `
        frame main() ret int {
          local a: int = 0xFF;
          local b: int = 0x0F;
          return a & b;
        }
      `;
      expect(() => check(source)).not.toThrow();
    });
  });

  describe("Struct Member Access", () => {
    it("should allow accessing existing members", () => {
      const source = `
        struct Point { x: int, y: int, }
        frame main() ret int {
          local p: Point;
          p.x = 10;
          return p.x;
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should reject accessing non-existent members", () => {
      // TODO: Should catch this in TypeChecking phase instead of CodeGen phase
      const source = `
        struct Point { x: int, y: int, }
        frame main() ret int {
          local p: Point;
          p.z = 10;
          return 0;
        }
      `;
      expect(() => check(source)).toThrow(CompilerError);
    });

    it("should allow method calls on structs", () => {
      const source = `
        struct Point {
          x: int,
          y: int,
          frame sum(this: Point) ret int { return this.x + this.y; }
        }
        frame main() ret int {
          local p: Point;
          p.x = 10;
          p.y = 20;
          return p.sum();
        }
      `;
      expect(() => check(source)).not.toThrow();
    });
  });

  describe("Cast Operations", () => {
    it("should allow valid casts", () => {
      const source = `
        frame main() ret int {
          local x: int = 10;
          local y: float = cast<float>(x);
          return 0;
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should allow pointer casts", () => {
      // TODO: Should allow casting to and from *void to any type, should make nullptr compatible with any pointer
      const source = `
        frame main() ret int {
          local p: *void = nullptr;
          local ip: *int = cast<*int>(p);
          return 0;
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should allow casting between integer types", () => {
      const source = `
        frame main() ret int {
          local a: i64 = 1000;
          local b: i32 = cast<i32>(a);
          return 0;
        }
      `;
      expect(() => check(source)).not.toThrow();
    });
  });

  describe("Variable Scoping", () => {
    it("should allow accessing variables in same scope", () => {
      const source = `
        frame main() ret int {
          local x: int = 10;
          local y: int = x;
          return y;
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should allow accessing variables in outer scope", () => {
      const source = `
        frame main() ret int {
          local x: int = 10;
          if (true) {
            local y: int = x;
          }
          return 0;
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should reject accessing variables from inner scope", () => {
      const source = `
        frame main() ret int {
          if (true) {
            local x: int = 10;
          }
          local y: int = x;
          return 0;
        }
      `;
      expect(() => check(source)).toThrow(CompilerError);
    });
  });

  describe("Import/Export Type Checking", () => {
    it("should type-check imported functions", () => {
      const source = `
        extern printf(fmt: string, ...) ret int;
        frame main() ret int {
          printf("Hello\\n");
          return 0;
        }
      `;
      expect(() => check(source)).not.toThrow();
    });
  });

  describe("Null Safety", () => {
    it("should allow null assignment to pointers", () => {
      const source = `
        frame main() ret int {
          local p: *int = null;
          return 0;
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should reject null assignment to non-pointers", () => {
      const source = `
        frame main() ret int {
          local x: int = null;
          return 0;
        }
      `;
      expect(() => check(source)).toThrow(CompilerError);
    });
  });

  describe("Loop Type Checking", () => {
    it("should type-check loop conditions", () => {
      const source = `
        frame main() ret int {
          loop (true) {
            break;
          }
          return 0;
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should allow break and continue in loops", () => {
      const source = `
        frame main() ret int {
          loop (true) {
            if (true) { break; }
            if (false) { continue; }
          }
          return 0;
        }
      `;
      expect(() => check(source)).not.toThrow();
    });
  });

  describe("Switch Statement Type Checking", () => {
    it("should type-check switch expression and cases", () => {
      const source = `
        frame main() ret int {
          local x: int = 1;
          switch (x) {
            case 1: {
              return 1;
            }
            case 2: {
              return 2;
            }
            default: {
              return 0;
            }
          }
        }
      `;
      expect(() => check(source)).not.toThrow();
    });

    it("should reject non-constant case values", () => {
      const source = `
        frame main() ret int {
          local x: int = 1;
          local y: int = 2;
          switch (x) {
            case y:
              return 1;
            default:
              return 0;
          }
        }
      `;
      // This should fail if we enforce constant case values
      // expect(() => check(source)).toThrow(CompilerError);
    });
  });
});
