/**
 * Test Helper: Parser Utilities
 *
 * Provides utilities for parsing BPL source code in tests.
 */

import { Parser } from "../../compiler/frontend/Parser";
import type * as AST from "../../compiler/common/AST";

/**
 * Parse BPL source code into an AST Program
 *
 * @param source - BPL source code
 * @param filename - Optional filename for error messages
 * @returns Parsed AST Program
 * @throws Error if parsing fails
 *
 * @example
 * ```typescript
 * const ast = parseSource(`
 *   frame main() {
 *     return 0;
 *   }
 * `);
 * expect(ast.statements).toHaveLength(1);
 * ```
 */
export function parseSource(
  source: string,
  filename = "test.bpl",
): AST.Program {
  const parser = new Parser(source, filename);
  return parser.parse();
}

/**
 * Parse a single BPL expression
 *
 * @param source - BPL expression (without semicolon)
 * @returns Parsed expression AST node
 *
 * @example
 * ```typescript
 * const expr = parseExpression("1 + 2 * 3");
 * expect(expr.kind).toBe("BinaryExpr");
 * ```
 */
export function parseExpression(source: string): AST.Expression {
  // Wrap in a variable declaration to parse as expression
  const fullSource = `local _test_ = ${source};`;
  const ast = parseSource(fullSource);

  if (ast.statements.length !== 1) {
    throw new Error("Expected exactly one statement");
  }

  const stmt = ast.statements[0];
  if (stmt?.kind !== "VariableDecl") {
    throw new Error("Expected variable declaration");
  }

  const varDecl = stmt as AST.VariableDecl;
  if (!varDecl.initializer) {
    throw new Error("Expected initializer");
  }

  return varDecl.initializer;
}

/**
 * Parse a single BPL statement
 *
 * @param source - BPL statement (with semicolon if needed)
 * @returns Parsed statement AST node
 *
 * @example
 * ```typescript
 * const stmt = parseStatement("local x: int = 5;");
 * expect(stmt.kind).toBe("VariableDecl");
 * ```
 */
export function parseStatement(source: string): AST.Statement {
  // Wrap in a function to parse as statement
  const fullSource = `frame _test_() { ${source} }`;
  const ast = parseSource(fullSource);

  if (ast.statements.length !== 1) {
    throw new Error("Expected exactly one top-level statement");
  }

  const funcDecl = ast.statements[0] as AST.FunctionDecl;
  if (funcDecl.kind !== "FunctionDecl") {
    throw new Error("Expected function declaration");
  }

  if (!funcDecl.body || funcDecl.body.kind !== "Block") {
    throw new Error("Expected function body");
  }

  const body = funcDecl.body as AST.BlockStmt;
  if (body.statements.length !== 1) {
    throw new Error("Expected exactly one statement in function body");
  }

  return body.statements[0]!;
}

/**
 * Parse and return specific node types from source
 */
export function parseFunction(source: string): AST.FunctionDecl {
  const ast = parseSource(source);
  const func = ast.statements.find((s) => s.kind === "FunctionDecl");
  if (!func) {
    throw new Error("No function declaration found");
  }
  return func as AST.FunctionDecl;
}

export function parseStruct(source: string): AST.StructDecl {
  const ast = parseSource(source);
  const struct = ast.statements.find((s) => s.kind === "StructDecl");
  if (!struct) {
    throw new Error("No struct declaration found");
  }
  return struct as AST.StructDecl;
}

export function parseEnum(source: string): AST.EnumDecl {
  const ast = parseSource(source);
  const enumDecl = ast.statements.find((s) => s.kind === "EnumDecl");
  if (!enumDecl) {
    throw new Error("No enum declaration found");
  }
  return enumDecl as AST.EnumDecl;
}
