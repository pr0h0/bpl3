import { describe, expect, it } from "bun:test";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

function check(code: string) {
  const tokens = lexWithGrammar(code, "test.bpl");
  const parser = new Parser(code, "test.bpl", tokens);
  const ast = parser.parse();
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(ast);
  if (checker.errors.length > 0) {
    // Filter out unused variable errors for these tests as we are testing variadics
    const errors = checker.errors.filter(
      (e) => !e.message.includes("Unused variable"),
    );
    if (errors.length > 0) {
      throw errors[0];
    }
  }
  return checker;
}

describe("Variadic Functions", () => {
  it("should support homogeneous variadics with explicit count", () => {
    const code = `
      frame sum(...args: int, count: int) ret int {
        local total: int = 0;
        loop (local i: int = 0; i < count; i = i + 1) {
          total = total + args[i];
        }
        return total;
      }

      frame main() {
        sum(1, 2, 3);
      }
    `;
    expect(() => check(code)).not.toThrow();
  });

  it("should fail if homogeneous variadic arguments have wrong type", () => {
    const code = `
      frame sum(...args: int, count: int) ret int {
        return 0;
      }

      frame main() {
        sum(1, "string", 3);
      }
    `;
    expect(() => check(code)).toThrow();
  });

  it("should support heterogeneous variadics (Any)", () => {
    const code = `
      frame print_all(...args: Any, count: int) {
        local x: *Any = args;
        local y: int = count;
      }

      frame main() {
        print_all(1, "string", true);
      }
    `;
    expect(() => check(code)).not.toThrow();
  });

  it("should fail if variadic function does not have count parameter", () => {
    const code = `
      frame sum(...args: int) {
        local x: *int = args;
      }

      frame main() {
        sum(1, 2, 3);
      }
    `;
    expect(() => check(code)).toThrow();
  });

  it("should fail if count parameter is not int", () => {
    const code = `
      frame sum(...args: int, count: float) {
        local x: *int = args;
      }

      frame main() {
        sum(1, 2, 3);
      }
    `;
    expect(() => check(code)).toThrow();
  });

  it("should fail if non-variadic arguments are missing", () => {
    const code = `
      frame foo(a: int, ...args: int, count: int) { 
        local x: int = a;
        local y: *int = args;
        local z: int = count;
      }

      frame main() {
        foo(); # Missing 'a'
      }
    `;
    expect(() => check(code)).toThrow();
  });

  it("should support empty variadic arguments", () => {
    const code = `
      frame sum(...args: int, count: int) { 
        local x: *int = args;
        local y: int = count;
      }

      frame main() {
        sum();
      }
    `;
    expect(() => check(code)).not.toThrow();
  });
});
