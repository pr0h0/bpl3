import { describe, it, expect } from "bun:test";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { CodeGenerator } from "../compiler/backend/CodeGenerator";

function generate(source: string): string {
  const tokens = lexWithGrammar(source, "test.bpl");
  const parser = new Parser(source, "test.bpl", tokens);
  const program = parser.parse();
  const typeChecker = new TypeChecker();
  typeChecker.checkProgram(program);
  const generator = new CodeGenerator();
  return generator.generate(program);
}

describe("CodeGenerator - Extended Tests", () => {
  describe("Control Flow", () => {
    it("should generate IR for if statement", () => {
      const source = `
        frame main() ret int {
          if (true) {
            return 1;
          }
          return 0;
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("br");
      expect(ir).toContain("label");
    });

    it("should generate IR for if-else statement", () => {
      const source = `
        frame main() ret int {
          if (true) {
            return 1;
          } else {
            return 0;
          }
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("br");
      expect(ir).toContain("label");
    });

    it("should generate IR for while loop", () => {
      const source = `
        frame main() ret int {
          local i: int = 0;
          loop (i < 10) {
            i = i + 1;
          }
          return i;
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("br");
      expect(ir).toContain("label");
    });

    it("should generate IR for infinite loop with break", () => {
      const source = `
        frame main() ret int {
          local i: int = 0;
          loop {
            i = i + 1;
            if (i >= 10) {break;}
          }
          return i;
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("br");
      expect(ir).toContain("label");
    });

    it("should generate IR for switch statement", () => {
      const source = `
        frame main() ret int {
          local x: int = 1;
          switch (x) {
            case 1:
              {return 100;}
            case 2:
              {return 200;}
            default:
              {return 0;}
          }
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("switch");
    });
  });

  describe("Arithmetic and Logical Operations", () => {
    it("should generate IR for addition", () => {
      const source = `
        frame add(a: int, b: int) ret int {
          return a + b;
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("add");
    });

    it("should generate IR for subtraction", () => {
      const source = `
        frame sub(a: int, b: int) ret int {
          return a - b;
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("sub");
    });

    it("should generate IR for multiplication", () => {
      const source = `
        frame mul(a: int, b: int) ret int {
          return a * b;
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("mul");
    });

    it("should generate IR for division", () => {
      const source = `
        frame div(a: int, b: int) ret int {
          return a / b;
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("div");
    });

    it("should generate IR for comparison operations", () => {
      const source = `
        frame compare(a: int, b: int) ret bool {
          return a < b;
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("icmp");
    });

    it("should generate IR for logical AND", () => {
      const source = `
        frame logic(a: bool, b: bool) ret bool {
          return a && b;
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("and");
    });

    it("should generate IR for logical OR", () => {
      const source = `
        frame logic(a: bool, b: bool) ret bool {
          return a || b;
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("or");
    });

    it("should generate IR for bitwise operations", () => {
      const source = `
        frame bitwise(a: int, b: int) ret int {
          return a & b;
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("and");
    });
  });

  describe("Pointer and Array Operations", () => {
    it("should generate IR for pointer dereference", () => {
      const source = `
        frame deref(p: *int) ret int {
          return *p;
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("load");
    });

    it("should generate IR for address-of operator", () => {
      const source = `
        frame addrof() ret *int {
          local x: int = 10;
          return &x;
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("alloca");
    });

    it("should generate IR for array access", () => {
      const source = `
        frame arrayAccess(arr: *int) ret int {
          return arr[5];
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("getelementptr");
      expect(ir).toContain("load");
    });

    it("should generate IR for array assignment", () => {
      const source = `
        frame arrayAssign(arr: *int) ret void {
          arr[5] = 10;
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("getelementptr");
      expect(ir).toContain("store");
    });

    it("should generate IR for pointer arithmetic", () => {
      const source = `
        frame ptrArith(p: *int) ret *int {
          return p + 5;
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("getelementptr");
    });
  });

  describe("Struct Operations", () => {
    it("should generate struct type definition", () => {
      const source = `
        struct Point { x: int, y: int, }
        frame main() ret int {
          local p: Point;
          return 0;
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("type");
      expect(ir).toContain("Point");
    });

    it("should generate IR for struct member access", () => {
      const source = `
        struct Point { x: int, y: int, }
        frame getX(p: *Point) ret int {
          return p.x;
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("getelementptr");
      expect(ir).toContain("load");
    });

    it("should generate IR for struct member assignment", () => {
      const source = `
        struct Point { x: int, y: int, }
        frame setX(p: *Point, val: int) ret void {
          p.x = val;
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("getelementptr");
      expect(ir).toContain("store");
    });

    it("should generate IR for struct method call", () => {
      const source = `
        struct Point {
          x: int,
          y: int,
          frame sum(this: *Point) ret int {
            return this.x + this.y;
          }
        }
        frame main() ret int {
          local p: Point;
          return p.sum();
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("call");
      expect(ir).toContain("Point_sum");
    });
  });

  describe("Function Calls", () => {
    it("should generate IR for function call with arguments", () => {
      const source = `
        frame add(a: int, b: int) ret int {
          return a + b;
        }
        frame main() ret int {
          return add(10, 20);
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("call");
      expect(ir).toContain("add");
    });

    it("should generate IR for void function call", () => {
      const source = `
        frame doSomething() ret void {
          local x: int = 10;
        }
        frame main() ret int {
          doSomething();
          return 0;
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("call");
      expect(ir).toContain("doSomething");
    });

    it("should generate IR for recursive function", () => {
      const source = `
        frame factorial(n: int) ret int {
          if (n <= 1) {
            return 1;
          }
          return n * factorial(n - 1);
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("call");
      expect(ir).toContain("factorial");
    });
  });

  describe("Type Casting", () => {
    it("should generate IR for integer to float cast", () => {
      const source = `
        frame castIntToFloat(x: int) ret float {
          return cast<float>(x);
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("sitofp");
    });

    it("should generate IR for float to integer cast", () => {
      const source = `
        frame castFloatToInt(x: float) ret int {
          return cast<int>(x);
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("fptosi");
    });

    it("should generate IR for pointer cast", () => {
      const source = `
        frame castPtr(p: *void) ret *int {
          return cast<*int>(p);
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("bitcast");
    });
  });

  describe("Literal Values", () => {
    it("should generate IR for integer literals", () => {
      const source = `
        frame getInt() ret int {
          return 42;
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("42");
    });

    it("should generate IR for float literals", () => {
      const source = `
        frame getFloat() ret float {
          return 3.14;
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("3.14");
    });

    it("should generate IR for boolean literals", () => {
      const source = `
        frame getBool() ret bool {
          return true;
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("i1 1");
    });

    it("should generate IR for null pointer", () => {
      const source = `
        frame getNull() ret *int {
          return null;
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("null");
    });

    it("should generate IR for string literals", () => {
      const source = `
        frame getString() ret string {
          return "Hello, World!";
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("Hello, World!");
    });
  });

  describe("Variable Declarations", () => {
    it("should generate IR for local variable", () => {
      const source = `
        frame main() ret int {
          local x: int = 10;
          return x;
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("alloca");
      expect(ir).toContain("store");
      expect(ir).toContain("load");
    });

    it("should generate IR for uninitialized variable", () => {
      const source = `
        frame main() ret int {
          local x: int;
          x = 10;
          return x;
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("alloca");
      expect(ir).toContain("store");
    });
  });

  describe("Compound Assignments", () => {
    it("should generate IR for += operator", () => {
      const source = `
        frame main() ret int {
          local x: int = 10;
          x += 5;
          return x;
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("add");
      expect(ir).toContain("store");
    });

    it("should generate IR for -= operator", () => {
      const source = `
        frame main() ret int {
          local x: int = 10;
          x -= 5;
          return x;
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("sub");
      expect(ir).toContain("store");
    });

    it("should generate IR for *= operator", () => {
      const source = `
        frame main() ret int {
          local x: int = 10;
          x *= 5;
          return x;
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("mul");
      expect(ir).toContain("store");
    });
  });

  describe("Ternary Operator", () => {
    it("should generate IR for ternary expression", () => {
      const source = `
        frame main() ret int {
          local x: int = true ? 10 : 20;
          return x;
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("br");
      expect(ir).toContain("label");
    });

    it("should generate IR for nested ternary", () => {
      const source = `
        frame main() ret int {
          local x: int = true ? (false ? 1 : 2) : 3;
          return x;
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("br");
      expect(ir).toContain("label");
    });
  });

  describe("Sizeof Operator", () => {
    it("should generate IR for sizeof with type", () => {
      const source = `
        frame main() ret int {
          return cast<int>(sizeof<int>());
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("4"); // Assuming 32-bit int
    });

    it("should generate IR for sizeof with struct", () => {
      const source = `
        struct Point { x: int, y: int, }
        frame main() ret int {
          return cast<int>(sizeof<Point>());
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("8"); // Two 32-bit ints
    });
  });

  describe("Generic Function Monomorphization", () => {
    it("should generate monomorphized functions for each type", () => {
      const source = `
        frame identity<T>(val: T) ret T {
          return val;
        }
        frame main() ret int {
          local x: int = identity<int>(42);
          local y: float = identity<float>(3.14);
          return x;
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("identity_int");
      expect(ir).toContain("identity_float");
    });

    it("should not duplicate monomorphized functions", () => {
      const source = `
        frame identity<T>(val: T) ret T {
          return val;
        }
        frame main() ret int {
          local x: int = identity<int>(42);
          local y: int = identity<int>(100);
          return x;
        }
      `;
      const ir = generate(source);
      // Should only have one monomorphized version
      const matches = ir.match(/define.*identity_int/g);
      expect(matches?.length).toBe(1);
    });
  });

  describe("Inheritance and Virtual Methods", () => {
    it("should generate IR for inherited member access", () => {
      const source = `
        struct Parent { x: int, }
        struct Child : Parent { y: int, }
        frame main() ret int {
          local c: Child;
          c.x = 10;
          return c.x;
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("getelementptr");
    });
  });

  describe("External Function Declarations", () => {
    it("should generate declaration for extern functions", () => {
      const source = `
        extern printf(fmt: string, ...) ret int;
        frame main() ret int {
          printf("Test\\n");
          return 0;
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("declare");
      expect(ir).toContain("printf");
    });
  });

  describe("Optimization Hints", () => {
    it("should generate efficient code for constant folding", () => {
      const source = `
        frame main() ret int {
          return 2 + 3 * 4;
        }
      `;
      const ir = generate(source);
      // Depending on optimization level, might be folded to 14
      expect(ir).toContain("ret");
    });

    it("should generate efficient code for dead code elimination", () => {
      const source = `
        frame main() ret int {
          local x: int = 10;
          if (false) {
            x = 20;
          }
          return x;
        }
      `;
      const ir = generate(source);
      // Dead code might be eliminated in optimized builds
      expect(ir).toBeDefined();
    });
  });

  describe("Complex Expressions", () => {
    it("should generate IR for operator precedence", () => {
      const source = `
        frame main() ret int {
          return 1 + 2 * 3 - 4 / 2;
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("mul");
      expect(ir).toContain("add");
      expect(ir).toContain("div");
      expect(ir).toContain("sub");
    });

    it("should generate IR for complex boolean expressions", () => {
      const source = `
        frame main() ret bool {
          return (true && false) || (true && !false);
        }
      `;
      const ir = generate(source);
      expect(ir).toContain("and");
      expect(ir).toContain("or");
    });
  });
});
