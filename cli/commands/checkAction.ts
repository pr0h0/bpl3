/**
 * Check command action.
 * Performs fast type checking without code generation.
 */

import * as fs from "fs";
import * as path from "path";
import type { Command } from "commander";
import { diagnosticFormatter } from "../DiagnosticFormatter";
import type { CompileOptions } from "../types";
import { getInputFilePathError } from "../utils";
import { expandSourceInputs } from "../SourceInputs";
import { Logger, LogLevel, setLogLevel } from "../../compiler/common/Logger";
import { updateConfig } from "../../compiler/common/Config";
import {
  CLI_JSON_CHECKS,
  createJsonReport,
} from "../../compiler/common/JsonContracts";
import {
  CHECK_INPUT_NOT_FILE_CODE,
  CHECK_INPUT_NOT_FOUND_CODE,
  CHECK_INPUT_SYMLINK_CODE,
  CHECK_NO_INPUTS_CODE,
  CHECK_PROCESSING_ERROR_CODE,
} from "./CheckContracts";

const log = new Logger("Check");

type CheckFileResult = {
  file: string;
  success: boolean;
  timeMs?: number;
  diagnostics?: unknown[];
  error?: string;
  errorCode?: string;
};

export async function runCheckCommand(
  files: string[],
  rawOptions: CompileOptions,
  command: Command,
): Promise<void> {
  const inheritedOptions =
    typeof command.optsWithGlobals === "function"
      ? (command.optsWithGlobals() as CompileOptions)
      : {};
  const options = {
    ...inheritedOptions,
    ...rawOptions,
    json: Boolean(rawOptions.json || inheritedOptions.json),
    quiet: Boolean(rawOptions.quiet || inheritedOptions.quiet),
    verbose: Boolean(rawOptions.verbose || inheritedOptions.verbose),
  };

  // Handle quiet mode
  if (options.quiet) {
    setLogLevel(LogLevel.ERROR);
  }
  if (options.color !== undefined) {
    updateConfig({
      features: { colorize: options.color },
    });
    diagnosticFormatter.setConfig({ colorize: options.color });
  }

  const exitNoInputs = (
    message: string,
    errorCode = CHECK_NO_INPUTS_CODE,
  ): never => {
    if (options.json) {
      console.log(
        JSON.stringify(
          createJsonReport(CLI_JSON_CHECKS.check, false, {
            totalFiles: 0,
            errorCount: 1,
            timeMs: 0,
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
  };

  if (!files || files.length === 0) exitNoInputs("No files specified.");
  // Directories expand to their sources, as for `format` and `lint`
  // (honoring .bplignore).
  try {
    files = expandSourceInputs(files!);
  } catch (error) {
    // Discovery failures (.bplignore, unreadable directories) are not
    // empty inputs.
    exitNoInputs(
      error instanceof Error ? error.message : String(error),
      CHECK_PROCESSING_ERROR_CODE,
    );
  }
  if (files.length === 0) {
    exitNoInputs("No BPL sources found in the supplied directories.");
  }

  const { checkSource, CompilerError } = await import("./checkEngine");
  const startTime = Date.now();
  let totalFiles = 0;
  let errorCount = 0;
  let warningCount = 0;
  const results: CheckFileResult[] = [];

  // `-` checks standard input, as for format and lint.
  const stdin = files.includes("-") ? fs.readFileSync(0, "utf8") : undefined;
  for (const filePath of files) {
    totalFiles++;
    try {
      const fromStdin = filePath === "-";
      const inputError = fromStdin ? null : getInputFilePathError(filePath);
      if (inputError) {
        if (options.json) {
          results.push({
            file: filePath,
            success: false,
            error: inputError,
            errorCode: getCheckInputErrorCode(inputError),
          });
        } else {
          log.error(`${inputError}: ${filePath}`);
        }
        errorCount++;
        continue;
      }

      const fileStartTime = Date.now();

      const content = fromStdin ? stdin! : fs.readFileSync(filePath, "utf-8");
      const sourcePath = fromStdin
        ? path.resolve(options.stdinFilepath || "stdin.bpl")
        : filePath;
      const displayName = fromStdin
        ? options.stdinFilepath || "<stdin>"
        : filePath;

      // --no-prelude checks the file alone, without resolving imports.
      const { errors: typeErrors, warnings } = checkSource(
        content,
        sourcePath,
        options.prelude === false,
      );
      warningCount += warnings.length;

      if (typeErrors.length > 0) {
        const diagnostics = [...typeErrors, ...warnings];
        if (options.json) {
          results.push({
            file: filePath,
            success: false,
            diagnostics:
              diagnosticFormatter.formatDiagnosticObjects(diagnostics),
          });
        } else {
          console.error(diagnosticFormatter.formatErrors(diagnostics));
        }
        errorCount++;
      } else {
        const elapsed = Date.now() - fileStartTime;
        if (options.json) {
          results.push({
            file: filePath,
            success: true,
            timeMs: elapsed,
            ...(warnings.length > 0
              ? {
                  diagnostics:
                    diagnosticFormatter.formatDiagnosticObjects(warnings),
                }
              : {}),
          });
        } else {
          // Warnings do not fail the check, but are always shown.
          if (warnings.length > 0) {
            console.error(diagnosticFormatter.formatErrors(warnings));
          }
          if (!options.quiet) {
            if (options.time) {
              console.log(`✓ ${displayName} (${elapsed}ms)`);
            } else {
              console.log(`✓ ${displayName}`);
            }
          }
        }
      }
    } catch (e) {
      if (options.json) {
        if (e instanceof CompilerError) {
          results.push({
            file: filePath,
            success: false,
            diagnostics: diagnosticFormatter.formatDiagnosticObjects([e]),
          });
        } else {
          results.push({
            file: filePath,
            success: false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      } else if (e instanceof CompilerError) {
        console.error(diagnosticFormatter.formatError(e));
      } else {
        log.error(
          `Error checking ${filePath}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      errorCount++;
    }
  }

  const totalTime = Date.now() - startTime;

  if (options.json) {
    console.log(
      JSON.stringify(
        createJsonReport(CLI_JSON_CHECKS.check, errorCount === 0, {
          totalFiles,
          errorCount,
          warningCount,
          timeMs: totalTime,
          files: results,
        }),
        null,
        2,
      ),
    );
  } else if (!options.quiet) {
    if (errorCount === 0) {
      if (options.time) {
        log.info(
          `\n✓ All ${totalFiles} files type checked successfully (${totalTime}ms)`,
        );
      } else {
        console.log(`\n✓ All ${totalFiles} files type checked successfully`);
      }
    } else {
      console.error(
        `\n✗ ${errorCount} of ${totalFiles} files failed type checking`,
      );
    }
  }

  if (errorCount > 0) {
    process.exit(1);
  }
}

function getCheckInputErrorCode(inputError: string): string {
  switch (inputError) {
    case "File not found":
      return CHECK_INPUT_NOT_FOUND_CODE;
    case "Input path is a symbolic link":
      return CHECK_INPUT_SYMLINK_CODE;
    case "Input path is not a file":
      return CHECK_INPUT_NOT_FILE_CODE;
    default:
      return "BPL_CHECK_INPUT_INVALID";
  }
}
