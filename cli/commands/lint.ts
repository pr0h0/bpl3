/**
 * Lint command registrar.
 * Keeps analysis dependencies out of CLI help startup.
 */

import type { Command } from "commander";
import type { LintOptions } from "../types";

export const LINT_INPUT_NOT_FOUND_CODE = "BPL_LINT_INPUT_NOT_FOUND";
export const LINT_INPUT_SYMLINK_CODE = "BPL_LINT_INPUT_SYMLINK";
export const LINT_INPUT_NOT_FILE_CODE = "BPL_LINT_INPUT_NOT_FILE";
export const LINT_NO_INPUTS_CODE = "BPL_LINT_NO_INPUTS";
export const LINT_JSON_ERROR_CODES = [
  LINT_INPUT_NOT_FOUND_CODE,
  LINT_INPUT_SYMLINK_CODE,
  LINT_INPUT_NOT_FILE_CODE,
  LINT_NO_INPUTS_CODE,
] as const;

export function registerLintCommand(program: Command): void {
  program
    .command("lint [files...]")
    .description("Lint BPL source files")
    .option("-v, --verbose", "enable verbose output")
    .option("--json", "output lint diagnostics in JSON format")
    .action(
      async (files: string[], rawOptions: LintOptions, command: Command) => {
        if (!files || files.length === 0) {
          const { runLintCommand } = await import("./lintAction");
          await runLintCommand(files, rawOptions, command);
          return;
        }

        const [{ runLintCommand }, compilerModule] = await Promise.all([
          import("./lintAction"),
          import("../../compiler"),
        ]);
        await runLintCommand(files, rawOptions, command, compilerModule);
      },
    );
}
