import type * as AST from "../common/AST";
import { CompilerError, type SourceLocation } from "../common/CompilerError";

export const SOURCE_COMPLEXITY_LIMIT_CODE = "BPL_SOURCE_COMPLEXITY_LIMIT";
export const MAX_SYNTAX_DEPTH = 512;

/** Bound recursive compiler passes using an iterative walk of the raw AST. */
export function validateSyntaxDepth(program: AST.Program): void {
  const pending: Array<{ value: unknown; depth: number }> = [
    { value: program, depth: 0 },
  ];
  const seenDepth = new WeakMap<object, number>();
  while (pending.length > 0) {
    const { value, depth } = pending.pop()!;
    if (typeof value !== "object" || value === null) continue;
    if ((seenDepth.get(value) ?? -1) >= depth) continue;
    seenDepth.set(value, depth);
    const isNode = "kind" in value && "location" in value;
    const nodeDepth = depth + (isNode ? 1 : 0);
    if (nodeDepth > MAX_SYNTAX_DEPTH) {
      throw syntaxDepthError((value as AST.ASTNode).location);
    }
    for (const child of Object.values(value)) {
      if (typeof child === "object" && child !== null) {
        pending.push({ value: child, depth: nodeDepth });
      }
    }
  }
}

/** Recognize host stack exhaustion without hiding unrelated parser failures. */
export function isParserStackOverflow(error: unknown): boolean {
  return (
    error instanceof RangeError &&
    /call stack|stack overflow/i.test(error.message)
  );
}

/** Create the same structured diagnostic for parser and AST depth exhaustion. */
export function syntaxDepthError(location: SourceLocation): CompilerError {
  return new CompilerError(
    "Source syntax nesting exceeds the compiler's supported depth.",
    "Split deeply nested expressions into smaller expressions or helper functions.",
    location,
    SOURCE_COMPLEXITY_LIMIT_CODE,
  );
}
