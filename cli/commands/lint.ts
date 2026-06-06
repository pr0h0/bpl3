/**
 * Lint Command Handler
 * Handles the `bpl lint` command
 */

import * as fs from "fs";
import type { Command } from "commander";
import { diagnosticFormatter } from "../DiagnosticFormatter";
import type { LintOptions } from "../types";
import { getInputFilePathError } from "../utils";
import { Logger } from "../../compiler/common/Logger";
import {
  CLI_JSON_CHECKS,
  createJsonReport,
} from "../../compiler/common/JsonContracts";

const log = new Logger("Lint");

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

/**
 * Register the lint command
 */
export function registerLintCommand(program: Command): void {
  program
    .command("lint [files...]")
    .description("Lint BPL source files")
    .option("-v, --verbose", "enable verbose output")
    .option("--json", "output lint diagnostics in JSON format")
    .action(async (files: string[], rawOptions: LintOptions, command: Command) => {
      const inheritedOptions =
        typeof command.optsWithGlobals === "function"
          ? (command.optsWithGlobals() as LintOptions)
          : {};
      const options = {
        ...inheritedOptions,
        ...rawOptions,
        json: Boolean(rawOptions.json || inheritedOptions.json),
        verbose: Boolean(rawOptions.verbose || inheritedOptions.verbose),
      };

      if (!files || files.length === 0) {
        if (options.json) {
          console.log(
            JSON.stringify(
              createJsonReport(CLI_JSON_CHECKS.lint, false, {
                totalFiles: 0,
                errorCount: 1,
                files: [],
                error: "No files specified.",
                errorCode: LINT_NO_INPUTS_CODE,
              }),
              null,
              2,
            ),
          );
        } else {
          log.error("No files specified.");
        }
        process.exit(1);
      }

      const { Parser, Linter, CompilerError, lexWithGrammar } =
        await import("../../compiler");
      const linter = new Linter();
      let hasErrors = false;
      const results: Array<{
        file: string;
        success: boolean;
        diagnostics?: unknown[];
        error?: string;
        errorCode?: string;
      }> = [];

      for (const file of files) {
        try {
          const inputError = getInputFilePathError(file);
          if (inputError) {
            if (options.json) {
              results.push({
                file,
                success: false,
                error: inputError,
                errorCode: getLintInputErrorCode(inputError),
              });
            } else {
              log.error(`${inputError}: ${file}`);
            }
            hasErrors = true;
            continue;
          }

          const content = fs.readFileSync(file, "utf-8");
          const tokens = lexWithGrammar(content, file);
          const parser = new Parser(content, file, tokens);
          const ast = parser.parse(true);

          const errors = linter.lint(ast);
          if (errors.length > 0) {
            hasErrors = true;
            if (options.json) {
              results.push({
                file,
                success: false,
                diagnostics: diagnosticFormatter.formatDiagnosticObjects(errors),
              });
            } else {
              console.error(diagnosticFormatter.formatErrors(errors));
            }
          } else if (options.json) {
            results.push({
              file,
              success: true,
              diagnostics: [],
            });
          }
        } catch (e) {
          hasErrors = true;
          if (options.json && e instanceof CompilerError) {
            results.push({
              file,
              success: false,
              diagnostics: diagnosticFormatter.formatDiagnosticObjects([e]),
            });
          } else if (options.json) {
            results.push({
              file,
              success: false,
              error: e instanceof Error ? e.message : String(e),
            });
          } else if (e instanceof CompilerError) {
            console.error(diagnosticFormatter.formatError(e));
          } else {
            log.error(`Error processing ${file}: ${e}`);
          }
        }
      }

      if (options.json) {
        const errorCount = results.reduce(
          (count, result) =>
            count + (result.success ? 0 : (result.diagnostics?.length ?? 1)),
          0,
        );
        console.log(
          JSON.stringify(
            createJsonReport(CLI_JSON_CHECKS.lint, !hasErrors, {
              totalFiles: files.length,
              errorCount,
              files: results,
            }),
            null,
            2,
          ),
        );
      }

      if (hasErrors) {
        process.exit(1);
      }
    });
}

function getLintInputErrorCode(inputError: string): string {
  switch (inputError) {
    case "File not found":
      return LINT_INPUT_NOT_FOUND_CODE;
    case "Input path is a symbolic link":
      return LINT_INPUT_SYMLINK_CODE;
    case "Input path is not a file":
      return LINT_INPUT_NOT_FILE_CODE;
    default:
      return "BPL_LINT_INPUT_INVALID";
  }
}
