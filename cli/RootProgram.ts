/**
 * Options of the default compile command (`bpl [files...]`). Shared by the
 * CLI entry point and the shell-completion generator, so completions always
 * match what the CLI accepts.
 */

import type { Command } from "commander";

export function configureRootOptions(program: Command): Command {
  return program
    .argument("[files...]", "source file(s) to compile")
    .option("-e, --eval <code>", "evaluate BPL code passed as string")
    .option("--stdin", "read BPL code from stdin")
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
      "--clang-flag <flag...>",
      "additional flags forwarded directly to clang",
    )
    .option("--wasm-runtime <mode>", "wasm runtime mode: freestanding or host")
    .option("--debug-ir-path <file>", "write diagnostic LLVM IR to a file")
    .option("-l, --lib <lib...>", "libraries to link with")
    .option("-L, --lib-path <path...>", "library search paths")
    .option("--object <file...>", "object files to link (.o, .ll, etc.)")
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
