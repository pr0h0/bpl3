import { describe, expect, it } from "bun:test";

import { CompilerError } from "../compiler/common/CompilerError";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

function parseProgram(source: string, filePath = "test.bpl") {
  const tokens = lexWithGrammar(source, filePath);
  const parser = new Parser(source, filePath, tokens);
  return parser.parse();
}

function check(source: string) {
  const program = parseProgram(source);
  const typeChecker = new TypeChecker();
  typeChecker.checkProgram(program);
  const typeErrors = typeChecker.getErrors();
  if (typeErrors.length > 0) {
    throw typeErrors[0];
  }
  return program;
}

describe("TypeChecker", () => {
  it("should clear failed import recovery state when reusing a checker", () => {
    const checker = new TypeChecker({ collectAllErrors: true });
    const failedImportSource = [
      'import shadow from "std/missing.bpl";',
      "frame main() ret int {",
      "  return shadow();",
      "}",
    ].join("\n");
    const unresolvedSource = [
      "frame main() ret int {",
      "  return shadow();",
      "}",
    ].join("\n");

    checker.checkProgram(
      parseProgram(failedImportSource, "reuse.bpl"),
      "reuse.bpl",
    );
    const failedImportMessages = checker
      .getErrors()
      .map((error) => error.message);
    expect(
      failedImportMessages.some((message) =>
        message.includes("Standard library module not found: std/missing.bpl"),
      ),
    ).toBe(true);
    expect(failedImportMessages).not.toContain("Undefined symbol 'shadow'");

    checker.errors = [];
    checker.checkProgram(
      parseProgram(unresolvedSource, "other.bpl"),
      "other.bpl",
    );
    const otherFileMessages = checker.getErrors().map((error) => error.message);
    expect(otherFileMessages).toContain("Undefined symbol 'shadow'");

    checker.errors = [];
    checker.checkProgram(
      parseProgram(unresolvedSource, "reuse.bpl"),
      "reuse.bpl",
    );
    const sameFileMessages = checker.getErrors().map((error) => error.message);
    expect(sameFileMessages).toContain("Undefined symbol 'shadow'");
  });

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
    // If `method(this: A)` is defined inside `struct B`, calling `b.method()` passes `B` as `this`.
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
