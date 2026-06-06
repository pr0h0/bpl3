/**
 * Dev Command Handler
 * Watch mode with automatic execution - perfect for rapid development
 */

import type { Command } from "commander";
import type { CompileOptions } from "../types";
import { Logger } from "../../compiler/common/Logger";
import { getExplicitParentCompileOptions } from "./compileOptions";

const log = new Logger("Dev");

/**
 * Register the dev command
 *
 * The `dev` command starts a development server that watches for file changes,
 * recompiles automatically, and re-executes the program. It's equivalent to
 * `bpl file.bpl --watch --run` but optimized for development workflow.
 *
 * Examples:
 *   bpl dev main.bpl
 *   bpl dev main.bpl arg1 arg2
 *   bpl dev main.bpl --clear
 *   bpl dev main.bpl --no-run      # Compile only, don't execute
 *   bpl dev main.bpl --debug-ir-path debug/dev.ll
 *   bpl dev main.bpl -v --time
 */
export function registerDevCommand(program: Command): void {
  program
    .command("dev")
    .argument("<file>", "BPL file to watch and run")
    .argument("[args...]", "arguments to pass to the program")
    .description("Development mode: watch, compile, and run automatically")
    .option("-v, --verbose", "enable verbose output")
    .option("-q, --quiet", "suppress non-error output")
    .option("--clear", "clear screen on each recompile")
    .option("--no-run", "compile only, don't execute")
    .option("-O <level>", "optimization level: 0, 1, 2, or 3")
    .option("--debug", "generate debug information (DWARF)")
    .option("--debug-ir-path <file>", "write diagnostic LLVM IR to a file")
    .option("--time", "show compilation time statistics")
    .option("--cache", "enable incremental compilation with module caching")
    .option("--cache-stats", "show incremental cache hit/miss statistics")
    .option("--no-prelude", "do not load implicit primitives")
    .option("--color", "force colored output")
    .option("--no-color", "disable colored output")
    .action(
      async (
        file: string,
        args: string[],
        _options: CompileOptions,
        command: Command,
      ) => {
        try {
          const { watchMode } = await import("../Watcher");
          // Merge parent options if any
          const globalOpts = getExplicitParentCompileOptions(command);
          const localOpts = command.opts<CompileOptions>();
          const compileOptions: CompileOptions = {
            ...globalOpts,
            ...localOpts,
            watch: true,
            run: localOpts.noRun !== true, // Default to running unless --no-run
            dwarf:
              localOpts.debug ||
              localOpts.dwarf ||
              globalOpts.debug ||
              globalOpts.dwarf,
          };

          watchMode(file, compileOptions, args);
        } catch (e) {
          log.error(`${e instanceof Error ? e.message : String(e)}`);
          process.exit(1);
        }
      },
    );
}
