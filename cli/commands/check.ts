/**
 * Check command registrar.
 * Keeps analysis dependencies out of CLI help startup.
 */

import type { Command } from "commander";

export {
  CHECK_INPUT_NOT_FILE_CODE,
  CHECK_INPUT_NOT_FOUND_CODE,
  CHECK_INPUT_SYMLINK_CODE,
  CHECK_JSON_ERROR_CODES,
  CHECK_NO_INPUTS_CODE,
} from "./CheckContracts";

/**
 * Register the check command.
 *
 * The `check` command performs type checking without generating code.
 */
export function registerCheckCommand(program: Command): void {
  program
    .command("check")
    .argument("[files...]", "BPL files to type check")
    .description("Type check BPL files without generating code (fast)")
    .option("-v, --verbose", "enable verbose output")
    .option("-q, --quiet", "suppress non-error output")
    .option("--json", "output results in JSON format")
    .option("--time", "show type checking time statistics")
    .option("--no-prelude", "do not load implicit primitives")
    .option("--color", "force colored output")
    .option("--no-color", "disable colored output")
    .action(async (files: string[], rawOptions: any, command: Command) => {
      const { runCheckCommand } = await import("./checkAction");
      await runCheckCommand(files, rawOptions, command);
    });
}
