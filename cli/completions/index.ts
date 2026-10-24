import { bashCompletion, zshCompletion } from "./scripts.generated";

/**
 * Embedded Completion Scripts
 * Contains bash and zsh completion scripts as strings for the compiled binary
 */

export const COMMON_TARGET_TRIPLES = [
  "x86_64-pc-linux-gnu",
  "aarch64-unknown-linux-gnu",
  "arm64-apple-darwin",
  "x86_64-apple-darwin",
  "x86_64-pc-windows-gnu",
  "wasm32-unknown-unknown",
  "wasm32-wasi",
] as const;

/** Generated from the shipped scripts by tools/generate_completions.ts. */
export function getBashCompletionScript(): string {
  return bashCompletion;
}
export function getZshCompletionScript(): string {
  return zshCompletion;
}
