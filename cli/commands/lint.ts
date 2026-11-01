/**
 * Lint command registrar.
 * Keeps analysis dependencies out of CLI help startup.
 */

import type { Command } from "commander";
import { collectOption } from "../RootProgram";
import type { LintOptions } from "../types";

export const LINT_INPUT_NOT_FOUND_CODE = "BPL_LINT_INPUT_NOT_FOUND";
export const LINT_INPUT_SYMLINK_CODE = "BPL_LINT_INPUT_SYMLINK";
export const LINT_INPUT_NOT_FILE_CODE = "BPL_LINT_INPUT_NOT_FILE";
export const LINT_NO_INPUTS_CODE = "BPL_LINT_NO_INPUTS";
export const LINT_PROCESSING_ERROR_CODE = "BPL_LINT_PROCESSING_ERROR";
export const LINT_UNKNOWN_RULE_CODE = "BPL_LINT_UNKNOWN_RULE";
export const LINT_JSON_ERROR_CODES = [
  LINT_INPUT_NOT_FOUND_CODE,
  LINT_INPUT_SYMLINK_CODE,
  LINT_INPUT_NOT_FILE_CODE,
  LINT_NO_INPUTS_CODE,
  LINT_PROCESSING_ERROR_CODE,
  LINT_UNKNOWN_RULE_CODE,
] as const;

/** Register lint options while loading analysis dependencies only on execution. */
export function registerLintCommand(program: Command): void {
  program
    .command("lint [files...]")
    .description("Lint BPL files, directories, or stdin (-)")
    .option(
      "--stdin-filepath <file>",
      "source path for stdin diagnostics and configuration",
    )
    .option("-v, --verbose", "enable verbose output")
    .option(
      "--no-fail-on-warnings",
      "report warnings without failing (errors still fail)",
    )
    .option("--json", "output lint diagnostics in JSON format")
    .option(
      "--disable <codes>",
      "skip lint rules, comma-separated (e.g. L003,L008; repeatable)",
      collectOption,
    )
    .action(
      async (files: string[], rawOptions: LintOptions, command: Command) => {
        const { runLintCommand } = await import("./lintAction");
        await runLintCommand(files, rawOptions, command);
      },
    );
}
