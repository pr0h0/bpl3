import { describe, expect, it } from "bun:test";

import Lexer from "../../lexer/lexer";
import ExportExpr from "../../parser/expression/exportExpr";
import ImportExpr from "../../parser/expression/importExpr";
import ExpressionType from "../../parser/expressionType";
import { Parser } from "../../parser/parser";

function parse(input: string) {
  const lexer = new Lexer(input);
  const parser = new Parser(lexer.tokenize());
  return parser.parse();
}

describe("Module Expressions", () => {
  it("should parse import statement", () => {
    const input = 'import printf from "std";';
    const program = parse(input);
    const importExpr = program.expressions[0] as ImportExpr;

    expect(importExpr.type).toBe(ExpressionType.ImportExpression);
    expect(importExpr.moduleName).toBe("std");
    expect(importExpr.importName[0]!.name).toBe("printf");
  });

  it("should parse export statement", () => {
    const input = "export func;";
    const program = parse(input);
    const exportExpr = program.expressions[0] as ExportExpr;

    expect(exportExpr.type).toBe(ExpressionType.ExportExpression);
    expect(exportExpr.exportName).toBe("func");
  });
});
