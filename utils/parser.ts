import type Token from "../lexer/token";
import type ProgramExpr from "../parser/expression/programExpr";
import type ImportExpr from "../parser/expression/importExpr";
import ExpressionType from "../parser/expressionType";
import type ExportExpr from "../parser/expression/exportExpr";
import type Expression from "../parser/expression/expr";
import { Parser } from "../parser/parser";
import Lexer from "../lexer/lexer";
import { readFile } from "./file";

export function generateTokens(code: string): Token[] {
  const lexer = new Lexer(code);
  return lexer.tokenize();
}

export function getFileTokens(filePath: string): Token[] {
  const content = readFile(filePath);
  return generateTokens(content);
}

export function parseTokens(tokens: Token[]): ProgramExpr {
  const parser = new Parser(tokens);
  return parser.parse();
}

export function parseFile(filePath: string): ProgramExpr {
  const tokens = getFileTokens(filePath);
  return parseTokens(tokens);
}

export function extractImportStatements(expression: ProgramExpr): ImportExpr[] {
  return expression.expressions.filter(
    (expr): expr is ImportExpr => expr.type === ExpressionType.ImportExpression,
  );
}

export function extractExportStatements(expression: ProgramExpr): Expression[] {
  return expression.expressions.filter(
    (expr) => expr.type === ExpressionType.ExportExpression,
  );
}

export function parseImportExpression(importExpr: ImportExpr) {
  const importPath = importExpr.moduleName;
  const importedFunctions = importExpr.importName
    .filter((name) => name.type === "function")
    .map((name) => name.name);
  const importedTypes = importExpr.importName
    .filter((name) => name.type === "type")
    .map((name) => name.name);
  return {
    types: importedTypes,
    functions: importedFunctions,
    path: importPath,
  };
}

export function parseImportExpressions(exprs: ImportExpr[]) {
  const imports: ReturnType<typeof parseImportExpression>[] = [];
  for (const expr of exprs) {
    imports.push(parseImportExpression(expr));
  }
  return imports;
}

export function parseExportExpression(exportExpr: ExportExpr) {
  return {
    name: exportExpr.exportName,
    type: exportExpr.exportType,
  };
}

export function parseExportExpressions(exprs: ExportExpr[]) {
  const exports: ReturnType<typeof parseExportExpression>[] = [];
  for (const expr of exprs) {
    exports.push(parseExportExpression(expr));
  }
  return exports;
}
