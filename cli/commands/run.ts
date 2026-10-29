/**
 * Run Command Handler
 * Compiles and executes a BPL program in one step
 */

import * as fs from "fs";
import * as os from "os";
import { collectOption } from "../RootProgram";
import * as path from "path";
import { resolveProjectEntry } from "../ProjectEntry";
import { Command, Option } from "commander";
import type { CompileOptions } from "../types";
import { Logger } from "../../compiler/common/Logger";
import { getExplicitParentCompileOptions } from "./compileOptions";
import { validateCompileInputSources } from "../BuildInputValidation";

const log = new Logger("Run");

/**
 * Register the run command
 *
 * The `run` command is a convenience wrapper that compiles a BPL file
 * and immediately executes it. It's equivalent to `bpl file.bpl --run`
 * but with cleaner syntax.
 *
 * Without -o, the LLVM IR and executable go to a temporary directory that is
 * removed when the command exits, so running a program leaves no artifacts
 * next to its source. Use -o (or `bpl build`) to keep the executable.
 *
 * Examples:
 *   bpl run main.bpl
 *   bpl run main.bpl -o bin/app
 *   bpl run main.bpl arg1 arg2 arg3
 *   bpl run main.bpl -v
 *   bpl run main.bpl -O2
 *   bpl run main.bpl --debug-ir-path debug/run.ll
 */
export function registerRunCommand(program: Command): void {
  program
    .command("run")
    .argument("[file]", "BPL file to compile and run")
    .argument("[args...]", "arguments to pass to the program")
    .description("Compile and execute a BPL program")
    .option(
      "--project",
      "use main/entry from ./bpl.json (implied when no file is given)",
    )
    .option(
      "-o, --output <file>",
      "keep the executable at this path (default: temporary, removed on exit)",
    )
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
    // Repeatable single-value options: a variadic `<lib...>` would also
    // consume the source file in `bpl run --lib m main.bpl`.
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
    .option(
      "--clang-flag <flag>",
      "flag forwarded directly to clang (repeatable)",
      collectOption,
    )
    .option("--no-prelude", "do not load implicit primitives")
    .option("--color", "force colored output")
    .option("--no-color", "disable colored output")
    .addHelpText(
      "after",
      "\nOptions after the file are still read by bpl; put program flags after --:\n" +
        "  bpl run main.bpl input.txt -- --verbose",
    )
    .action(
      async (
        file: string | undefined,
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
          // `bpl run -- args` in a project passes args to the project entry.
          const projectMode = localOpts.project || fs.existsSync("bpl.json");
          if (projectMode && file && isProjectProgramArgument(command)) {
            args = [file, ...args];
            file = undefined;
          }
          file = resolveProjectEntry(file, localOpts.project);
          validateCompileInputSources([file], compileOptions);
          if (!compileOptions.output) {
            compileOptions.output = createTemporaryRunOutput(file);
          }

          await processFileAsync(file, compileOptions, args);
        } catch (e) {
          log.error(`${e instanceof Error ? e.message : String(e)}`);
          process.exit(1);
        }
      },
    );
}

/** Parse only the prefix, so an option value cannot masquerade as a file operand. */
function isProjectProgramArgument(command: Command): boolean {
  const delimiter = process.argv.indexOf("--");
  if (delimiter < 0) return false;
  const parser = new Command()
    .helpOption(false)
    .allowUnknownOption()
    .exitOverride();
  const seen = new Set<string>();
  for (let owner: Command | null = command; owner; owner = owner.parent) {
    for (const option of owner.options) {
      const key = option.long || option.short || option.flags;
      if (seen.has(key)) continue;
      seen.add(key);
      parser.addOption(new Option(option.flags));
    }
  }
  const { operands } = parser.parseOptions(process.argv.slice(2, delimiter));
  return operands.length === 1 && operands[0] === command.name();
}

/** Allocate a per-run output path that is removed however the command exits. */
function createTemporaryRunOutput(file: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bpl-run-"));
  const cleanup = () => fs.rmSync(directory, { recursive: true, force: true });
  process.on("exit", cleanup);
  for (const [signal, code] of [
    ["SIGINT", 130],
    ["SIGTERM", 143],
  ] as const) {
    process.once(signal, () => process.exit(code));
  }
  const name = path.basename(file).replace(/\.[^.]+$/, "") || "program";
  return path.join(directory, name);
}
