import type { Program } from "../common/AST";

// Keep formatting provenance out of AST traversal/serialization. Entries are
// released with their programs; retain source for declaration layout as well.
const sources = new WeakMap<Program, string>();

export function rememberParsedSource(program: Program, source: string): void {
  sources.set(program, source);
}

export function getParsedSource(program: Program): string | undefined {
  return sources.get(program);
}
