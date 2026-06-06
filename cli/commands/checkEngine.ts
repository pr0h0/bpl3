/**
 * Focused source type-checking engine.
 * Keeps the full compiler barrel out of check command execution.
 */

import { CompilerError } from "../../compiler/common/CompilerError";
import { lexWithGrammar } from "../../compiler/frontend/GrammarLexer";
import { Parser } from "../../compiler/frontend/Parser";
import { TypeChecker } from "../../compiler/middleend/TypeChecker";

export { CompilerError };

export function checkSource(
  content: string,
  filePath: string,
  skipImportResolution: boolean,
): CompilerError[] {
  const tokens = lexWithGrammar(content, filePath);
  const parser = new Parser(content, filePath, tokens);
  const ast = parser.parse(false);
  const typeChecker = new TypeChecker({
    skipImportResolution,
    collectAllErrors: true,
  });
  typeChecker.checkProgram(ast);
  return typeChecker.getErrors();
}
