/**
 * Options of the default compile command (`bpl [files...]`). Shared by the
 * CLI entry point and the shell-completion generator, so completions always
 * match what the CLI accepts.
 */

import type { Command } from "commander";

/**
 * Accumulate a repeatable option (`-l m -l c`). A variadic option would also
 * consume a following source file (`bpl run --lib m main.bpl`).
 */
export function collectOption(
  value: string,
  previous: string[] | undefined,
): string[] {
  return [...(previous ?? []), value];
}

export function configureRootOptions(program: Command): Command {
  return program
    .argument("[files...]", "source file(s) to compile")
    .option(
      "-e, --eval <code>",
      "compile and run BPL code given as a string (--emit llvm prints its IR)",
    )
    .option(
      "--stdin",
      "compile and run BPL code read from stdin (--emit llvm prints its IR)",
    )
    .option("-o, --output <file>", "output file path")
    .option("--emit <type>", "emit type: llvm, ast, tokens, formatted", "llvm")
    .option("-d, --dwarf", "generate DWARF debug information")
    .option(
      "--target <triple>",
      "target triple for clang (e.g. x86_64-pc-windows-gnu)",
    )
    .option("--sysroot <path>", "sysroot path for cross-compilation")
    .option("--cpu <cpu>", "target CPU for clang (e.g. znver4)")
    .option("--march <arch>", "target architecture for clang (e.g. arm64)")
    .option(
      "--clang-flag <flag>",
      "flag forwarded directly to clang (repeatable)",
      collectOption,
    )
    .option("--wasm-runtime <mode>", "wasm runtime mode: freestanding or host")
    .option("--debug-ir-path <file>", "write diagnostic LLVM IR to a file")
    .option(
      "-l, --lib <lib>",
      "library to link with (repeatable)",
      collectOption,
    )
    .option(
      "-L, --lib-path <path>",
      "library search path (repeatable)",
      collectOption,
    )
    .option(
      "--object <file>",
      "object file to link, .o or .ll (repeatable)",
      collectOption,
    )
    .option("-v, --verbose", "enable verbose output")
    .option("-q, --quiet", "suppress non-error output")
    .option("--cache", "enable incremental compilation with module caching")
    .option("--cache-stats", "show incremental cache hit/miss statistics")
    .option(
      "-j, --jobs <count>",
      "parallel module compilation jobs for cached builds",
    )
    .option("--no-prelude", "do not load implicit primitives")
    .option("-O <level>", "optimization level: 0, 1, 2, or 3", "0")
    .option("--debug", "generate debug information (DWARF, alias for --dwarf)")
    .option("--time", "show compilation time statistics")
    .option("--json", "output in JSON format")
    .option("--color", "force colored output")
    .option("--no-color", "disable colored output");
}
