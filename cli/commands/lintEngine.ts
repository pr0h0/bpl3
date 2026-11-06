/**
 * Focused source-linting engine.
 * Keeps the full compiler barrel out of lint command execution.
 */

import { CompilerError } from "../../compiler/common/CompilerError";
import { Parser } from "../../compiler/frontend/Parser";
import { LINT_RULE_CODES, Linter } from "../../compiler/linter/Linter";
import { fixUnusedImports } from "../../compiler/linter/LintFixes";

export { CompilerError, LINT_RULE_CODES };

/**
 * A lint function that leaves out the diagnostic codes in `disabledCodes`
 * and in the per-file `alsoDisabled` (from a project configuration).
 */
export function createLintEngine(disabledCodes: readonly string[] = []) {
  const linters = new Map<string, Linter>();

  return (
    content: string,
    filePath: string,
    alsoDisabled: readonly string[] = [],
  ): CompilerError[] => {
    const codes = [...new Set([...disabledCodes, ...alsoDisabled])].sort();
    const key = codes.join(",");
    let linter = linters.get(key);
    if (!linter) {
      linter = new Linter([], new Set(codes));
      linters.set(key, linter);
    }
    const parser = new Parser(content, filePath);
    return linter.lint(parser.parse(true), content);
  };
}

/** `content` with unused imports removed, or undefined if none are unused. */
export function fixSource(
  content: string,
  filePath: string,
): string | undefined {
  return fixUnusedImports(new Parser(content, filePath).parse(true), content);
}
