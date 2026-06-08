/**
 * Focused source-linting engine.
 * Keeps the full compiler barrel out of lint command execution.
 */

import { CompilerError } from "../../compiler/common/CompilerError";
import { Parser } from "../../compiler/frontend/Parser";
import { Linter } from "../../compiler/linter/Linter";

export { CompilerError };

export function createLintEngine() {
  const linter = new Linter();

  return (content: string, filePath: string): CompilerError[] => {
    const parser = new Parser(content, filePath);
    return linter.lint(parser.parse(true));
  };
}
