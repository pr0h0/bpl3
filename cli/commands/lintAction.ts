/**
 * Lint command action.
 * Handles lint execution after command registration.
 */

import * as fs from "fs";
import { expandSourceInputs } from "../SourceInputs";
import { DiagnosticSeverity } from "../../compiler/common/CompilerError";
import type { Command } from "commander";
import { diagnosticFormatter } from "../DiagnosticFormatter";
import type { LintOptions } from "../types";
import { getInputFilePathError } from "../utils";
import { Logger } from "../../compiler/common/Logger";
import {
  CLI_JSON_CHECKS,
  createJsonReport,
} from "../../compiler/common/JsonContracts";
import {
  LINT_INPUT_NOT_FILE_CODE,
  LINT_INPUT_NOT_FOUND_CODE,
  LINT_INPUT_SYMLINK_CODE,
  LINT_NO_INPUTS_CODE,
  LINT_PROCESSING_ERROR_CODE,
} from "./lint";

const log = new Logger("Lint");

/** Expand source inputs, lint each file, and report failures as JSON or text. */
export async function runLintCommand(
  files: string[],
  rawOptions: LintOptions,
  command: Command,
): Promise<void> {
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
    exitLintInputFailure(
      options.json,
      "No files specified.",
      LINT_NO_INPUTS_CODE,
    );
  }

  try {
    files = expandSourceInputs(files);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    exitLintInputFailure(options.json, message, LINT_PROCESSING_ERROR_CODE);
  }
  if (!files.length) {
    exitLintInputFailure(
      options.json,
      "No BPL sources found in the supplied directories.",
      LINT_NO_INPUTS_CODE,
    );
  }
  const stdin = files.includes("-") ? fs.readFileSync(0, "utf8") : undefined;
  const { CompilerError, createLintEngine } = await import("./lintEngine");
  const lintSource = createLintEngine();
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
      const inputError = file === "-" ? null : getInputFilePathError(file);
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

      const content = file === "-" ? stdin! : fs.readFileSync(file, "utf-8");
      const errors = lintSource(
        content,
        file === "-" ? options.stdinFilepath || "stdin.bpl" : file,
      );
      if (errors.length > 0) {
        const fails =
          options.failOnWarnings !== false ||
          errors.some(
            (e) => e.toDiagnostic().severity === DiagnosticSeverity.Error,
          );
        hasErrors ||= fails;
        if (options.json) {
          results.push({
            file,
            success: !fails,
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
    // Count by severity: a naming warning is not an error unless
    // --fail-on-warnings (the default) makes the run fail.
    let errorCount = 0;
    let warningCount = 0;
    for (const result of results) {
      if (!result.diagnostics) {
        if (!result.success) errorCount++;
        continue;
      }
      for (const diagnostic of result.diagnostics as { severity?: string }[]) {
        if (diagnostic.severity === "warning") warningCount++;
        else errorCount++;
      }
    }
    console.log(
      JSON.stringify(
        createJsonReport(CLI_JSON_CHECKS.lint, !hasErrors, {
          totalFiles: files.length,
          errorCount,
          warningCount,
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
}

/** Map input-path validation failures to the stable lint JSON error codes. */
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

/** Report a pre-analysis input failure without mixing JSON and stderr output. */
function exitLintInputFailure(
  json: boolean | undefined,
  message: string,
  errorCode: string,
): never {
  if (json) {
    console.log(
      JSON.stringify(
        createJsonReport(CLI_JSON_CHECKS.lint, false, {
          totalFiles: 0,
          errorCount: 1,
          files: [],
          error: message,
          errorCode,
        }),
        null,
        2,
      ),
    );
  } else {
    log.error(message);
  }
  process.exit(1);
}
