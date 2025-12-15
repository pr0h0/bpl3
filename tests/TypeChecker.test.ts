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

describe("TypeChecker", () => {
  it("should pass for valid struct method access", () => {
    const source = `
      struct Point {
        x: int,
        y: int,
        frame sum(this: Point) ret int {
          return this.x + this.y;
        }
      }
      frame main() {
        local p: Point;
        p.sum();
      }
    `;
    expect(() => check(source)).not.toThrow();
  });

  it("should fail when accessing static method on instance", () => {
    const source = `
      struct S {
        frame staticFunc() {}
      }
      frame main() {
        local s: S;
        s.staticFunc();
      }
    `;
    expect(() => check(source)).toThrow(CompilerError);
  });

  it("should fail when accessing instance method on type", () => {
    const source = `
      struct S {
        frame instanceFunc(this: S) {}
      }
      frame main() {
        S.instanceFunc();
      }
    `;
    expect(() => check(source)).toThrow(CompilerError);
  });

  it("should fail if 'this' type mismatch", () => {
    const source = `
      struct A {}
      struct B {
        frame method(this: A) {} 
      }
    `;
    // This might fail during parsing or type checking depending on when we check 'this' type.
    // My implementation checks it during member access, but also we should probably check it during declaration if possible,
    // or at least when calling.
    // Wait, if I define `method(this: A)` inside `struct B`, is that allowed?
    // The parser doesn't prevent it. The type checker checks compatibility at call site.
    // But `this` parameter implies it expects `A`.
    // If I call `b.method()`, `b` is `B`. `this` expects `A`.
    // If `B` is not compatible with `A`, it should fail.

    const source2 = `
        struct A {}
        struct B {
            frame method(this: A) {}
        }
        frame main() {
            local b: B;
            b.method();
        }
    `;

    expect(() => check(source2)).toThrow(CompilerError);
  });
});
