/**
 * Build Command Handler
 * Explicit compilation command for building BPL programs
 */

import { Command } from "commander";
import { processFile } from "../CompilationRunner";
import type { CompileOptions } from "../types";
import { Logger } from "../../compiler/common/Logger";

const log = new Logger("Build");

/**
 * Register the build command
 *
 * The `build` command is an explicit way to compile BPL files.
 * It's more discoverable than the default action and makes intent clearer.
 *
 * Examples:
 *   bpl build main.bpl
 *   bpl build main.bpl -o output
 *   bpl build main.bpl -O3 --debug
 *   bpl build main.bpl --target x86_64-pc-windows-gnu
 *   bpl build main.bpl --emit llvm -v
 */
export function registerBuildCommand(program: Command): void {
  program
    .command("build")
    .argument("<file>", "BPL file to compile")
    .description("Compile a BPL program")
    .option("-o, --output <file>", "output file path")
    .option("--emit <type>", "emit type: llvm, ast, tokens, formatted", "llvm")
    .option("-v, --verbose", "enable verbose output")
    .option("-q, --quiet", "suppress non-error output")
    .option("-O <level>", "optimization level: 0, 1, 2, or 3", "0")
    .option("--debug", "generate debug information (DWARF)")
    .option("--time", "show compilation time statistics")
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
    .option("-l, --lib <lib...>", "libraries to link with")
    .option("-L, --lib-path <path...>", "library search paths")
    .option("--object <file...>", "object files to link (.o, .ll, etc.)")
    .option("--cache", "enable incremental compilation with module caching")
    .option("--no-prelude", "do not load implicit primitives")
    .option("--color", "force colored output")
    .option("--no-color", "disable colored output")
    .option("--json", "output in JSON format")
    .action((file: string, options: CompileOptions, command: Command) => {
      try {
        // Merge parent options if any
        const globalOpts = command.parent?.opts() || {};
        const compileOptions: CompileOptions = {
          ...globalOpts,
          ...options,
          dwarf: options.debug || options.dwarf,
        };

        processFile(file, compileOptions);
      } catch (e) {
        log.error(`${e instanceof Error ? e.message : String(e)}`);
        process.exit(1);
      }
    });
}
