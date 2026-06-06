/**
 * Run Command Handler
 * Compiles and executes a BPL program in one step
 */

import type { Command } from "commander";
import type { CompileOptions } from "../types";
import { Logger } from "../../compiler/common/Logger";
import { getExplicitParentCompileOptions } from "./compileOptions";

const log = new Logger("Run");

/**
 * Register the run command
 *
 * The `run` command is a convenience wrapper that compiles a BPL file
 * and immediately executes it. It's equivalent to `bpl file.bpl --run`
 * but with cleaner syntax.
 *
 * Examples:
 *   bpl run main.bpl
 *   bpl run main.bpl arg1 arg2 arg3
 *   bpl run main.bpl -v
 *   bpl run main.bpl -O2
 *   bpl run main.bpl --debug-ir-path debug/run.ll
 */
export function registerRunCommand(program: Command): void {
  program
    .command("run")
    .argument("<file>", "BPL file to compile and run")
    .argument("[args...]", "arguments to pass to the program")
    .description("Compile and execute a BPL program")
    .option("-v, --verbose", "enable verbose output")
    .option("-q, --quiet", "suppress non-error output")
    .option("-O <level>", "optimization level: 0, 1, 2, or 3")
    .option("--debug", "generate debug information (DWARF)")
    .option("--debug-ir-path <file>", "write diagnostic LLVM IR to a file")
    .option("--time", "show compilation time statistics")
    .option("--cache", "enable incremental compilation with module caching")
    .option(
      "-j, --jobs <count>",
      "parallel module compilation jobs for cached builds",
    )
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
          const { processFileAsync } = await import("../CompilationRunner");
          // Merge parent options if any
          const globalOpts = getExplicitParentCompileOptions(command);
          const localOpts = command.opts<CompileOptions>();
          const compileOptions: CompileOptions = {
            ...globalOpts,
            ...localOpts,
            run: true,
            dwarf:
              localOpts.debug ||
              localOpts.dwarf ||
              globalOpts.debug ||
              globalOpts.dwarf,
          };

          await processFileAsync(file, compileOptions, args);
        } catch (e) {
          log.error(`${e instanceof Error ? e.message : String(e)}`);
          process.exit(1);
        }
      },
    );
}
