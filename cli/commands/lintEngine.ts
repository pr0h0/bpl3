/**
 * Focused source-linting engine.
 * Keeps the full compiler barrel out of lint command execution.
 */

import { CompilerError } from "../../compiler/common/CompilerError";
import { lexWithGrammar } from "../../compiler/frontend/GrammarLexer";
import { Parser } from "../../compiler/frontend/Parser";
import { Linter } from "../../compiler/linter/Linter";

export { CompilerError };

export function createLintEngine() {
  const linter = new Linter();

  return (content: string, filePath: string): CompilerError[] => {
    const tokens = lexWithGrammar(content, filePath);
    const parser = new Parser(content, filePath, tokens);
    return linter.lint(parser.parse(true));
  };
}
