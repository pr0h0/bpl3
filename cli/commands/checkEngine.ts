/**
 * Focused source type-checking engine.
 * Keeps the full compiler barrel out of check command execution.
 */

import { CompilerError } from "../../compiler/common/CompilerError";
import { Parser } from "../../compiler/frontend/Parser";
import { TypeChecker } from "../../compiler/middleend/TypeChecker";

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
  typeChecker.checkProgram(ast);
  return {
    errors: typeChecker.getErrors(),
    warnings: typeChecker.getWarnings(),
  };
}
