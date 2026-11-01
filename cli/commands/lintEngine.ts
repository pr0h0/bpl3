/**
 * Focused source-linting engine.
 * Keeps the full compiler barrel out of lint command execution.
 */

import { CompilerError } from "../../compiler/common/CompilerError";
import { Parser } from "../../compiler/frontend/Parser";
import { LINT_RULE_CODES, Linter } from "../../compiler/linter/Linter";

export { CompilerError, LINT_RULE_CODES };

/** A lint function that leaves out the diagnostic codes in `disabledCodes`. */
export function createLintEngine(disabledCodes: readonly string[] = []) {
  const linter = new Linter([], new Set(disabledCodes));

  return (content: string, filePath: string): CompilerError[] => {
    const parser = new Parser(content, filePath);
    return linter.lint(parser.parse(true), content);
  };
}
