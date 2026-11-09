/**
 * Focused source type-checking engine.
 * Keeps the full compiler barrel out of check command execution.
 */

import { CompilerError } from "../../compiler/common/CompilerError";
import { Parser } from "../../compiler/frontend/Parser";
import { TypeChecker } from "../../compiler/middleend/TypeChecker";
import { warningsForFile } from "../DiagnosticFormatter";

export { CompilerError };

export interface CheckSourceResult {
  errors: CompilerError[];
  warnings: CompilerError[];
}

export function checkSource(
  content: string,
  filePath: string,
  skipImportResolution: boolean,
): CheckSourceResult {
  const parser = new Parser(content, filePath);
  // Match `bpl build`: the implicit prelude (built-in error types) is loaded
  // unless import resolution is skipped (--no-prelude).
  const ast = parser.parse(!skipImportResolution);
  const typeChecker = new TypeChecker({
    skipImportResolution,
    collectAllErrors: true,
  });
  typeChecker.setCurrentModulePath(filePath);
  // A file declaring `main` is held to the same signature rules as a build.
  const hasMain = ast.statements.some(
    (statement) =>
      statement.kind === "FunctionDecl" && statement.name === "main",
  );
  typeChecker.checkProgram(ast, undefined, { isEntryPoint: hasMain });
  return {
    errors: typeChecker.getErrors(),
    warnings: warningsForFile(typeChecker.getWarnings(), filePath),
  };
}
