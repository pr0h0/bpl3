import type { Program } from "../common/AST";

// Keep formatting provenance out of AST traversal/serialization. Entries are
// released with their programs; parsing comment-free files needs no entry.
const sources = new WeakMap<Program, string>();

export function rememberParsedSource(program: Program, source: string): void {
  if (program.comments?.length) sources.set(program, source);
}

export function getParsedSource(program: Program): string | undefined {
  return sources.get(program);
}
