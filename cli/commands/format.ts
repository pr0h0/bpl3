/**
 * Format command registrar.
 * Keeps formatting dependencies out of CLI help startup.
 */

import type { Command } from "commander";
import type { FormatOptions } from "../types";

export const FORMAT_JSON_REQUIRES_CHECK_CODE = "BPL_FORMAT_JSON_REQUIRES_CHECK";
export const FORMAT_NO_INPUTS_CODE = "BPL_FORMAT_NO_INPUTS";
export const FORMAT_WRITE_CHECK_CONFLICT_CODE =
  "BPL_FORMAT_WRITE_CHECK_CONFLICT";
export const FORMAT_INPUT_NOT_FOUND_CODE = "BPL_FORMAT_INPUT_NOT_FOUND";
export const FORMAT_INPUT_NOT_FILE_CODE = "BPL_FORMAT_INPUT_NOT_FILE";
export const FORMAT_NOT_FORMATTED_CODE = "BPL_FORMAT_NOT_FORMATTED";
export const FORMAT_PROCESSING_ERROR_CODE = "BPL_FORMAT_PROCESSING_ERROR";
export const FORMAT_JSON_ERROR_CODES = [
  FORMAT_JSON_REQUIRES_CHECK_CODE,
  FORMAT_NO_INPUTS_CODE,
  FORMAT_WRITE_CHECK_CONFLICT_CODE,
  FORMAT_INPUT_NOT_FOUND_CODE,
  FORMAT_INPUT_NOT_FILE_CODE,
  FORMAT_NOT_FORMATTED_CODE,
  FORMAT_PROCESSING_ERROR_CODE,
] as const;

export function registerFormatCommand(program: Command): void {
  program
    .command("format [files...]")
    .description("Format BPL source files")
    .option("-w, --write", "write formatted output back to file")
    .option("--check", "check whether files are formatted without writing")
    .option("-v, --verbose", "enable verbose output")
    .option("--json", "output machine-readable format check result")
    .action(
      async (files: string[], options: FormatOptions, command: Command) => {
        const { runFormatCommand } = await import("./formatAction");
        await runFormatCommand(files, options, command);
      },
    );
}
