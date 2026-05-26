import { describe, expect, it } from "bun:test";

import type * as AST from "../compiler/common/AST";
import { Formatter } from "../compiler/formatter/Formatter";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { compileToLLVM, parseSource } from "./helpers";

function checkSource(source: string): string[] {
  const program = parseSource(source);
  const checker = new TypeChecker();
  checker.checkProgram(program);
  return checker.getErrors().map((error) => error.message);
}

describe("Function Attributes", () => {
  it("parses attributes before function declarations", () => {
    const program = parseSource(`
      @[inline, cold]
      frame f() {}
    `);

    const func = program.statements.find(
      (statement): statement is AST.FunctionDecl =>
        statement.kind === "FunctionDecl",
    );

    expect(func?.attributes.map((attr) => attr.name)).toEqual([
      "inline",
      "cold",
    ]);
    expect(func?.attributes[0]?.location.startLine).toBe(2);
  });

  it("rejects unknown function attributes", () => {
    const errors = checkSource(`
      @[trace]
      frame f() {}
    `);

    expect(errors.join("\n")).toContain("Unknown function attribute 'trace'");
  });

  it("rejects duplicate function attributes", () => {
    const errors = checkSource(`
      @[inline, inline]
      frame f() {}
    `);

    expect(errors.join("\n")).toContain("Duplicate function attribute 'inline'");
  });

  it("rejects conflicting function attributes", () => {
    const errors = checkSource(`
      @[always_inline, noinline]
      frame f() {}
    `);

    expect(errors.join("\n")).toContain("Conflicting function attributes");
  });

  it("rejects noreturn on functions that return values", () => {
    const errors = checkSource(`
      @[noreturn]
      frame f() ret int {
        return 1;
      }
    `);

    expect(errors.join("\n")).toContain("noreturn");
  });
});
