/**
 * Check command action.
 * Performs fast type checking without code generation.
 */

import * as fs from "fs";
import type { Command } from "commander";
import { diagnosticFormatter } from "../DiagnosticFormatter";
import { getInputFilePathError } from "../utils";
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
} from "./CheckContracts";

const log = new Logger("Check");

export async function runCheckCommand(
  files: string[],
  rawOptions: any,
  command: Command,
): Promise<void> {
  const inheritedOptions =
    typeof command.optsWithGlobals === "function"
      ? command.optsWithGlobals()
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
    setLogLevel(LogLevel.SILENT);
  }
  if (options.color !== undefined) {
    updateConfig({
      features: { colorize: options.color },
    });
    diagnosticFormatter.setConfig({ colorize: options.color });
  }

  if (!files || files.length === 0) {
    if (options.json) {
      console.log(
        JSON.stringify(
          createJsonReport(CLI_JSON_CHECKS.check, false, {
            totalFiles: 0,
            errorCount: 1,
            timeMs: 0,
            files: [],
            error: "No files specified.",
            errorCode: CHECK_NO_INPUTS_CODE,
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

  const { checkSource, CompilerError } = await import("./checkEngine");
  const startTime = Date.now();
  let totalFiles = 0;
  let errorCount = 0;
  const results: any[] = [];

  for (const filePath of files) {
    totalFiles++;
    try {
      const inputError = getInputFilePathError(filePath);
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

      const content = fs.readFileSync(filePath, "utf-8");

      // Type check (with modules if not --no-prelude)
      if (options.prelude !== false) {
        const typeErrors = checkSource(content, filePath, false);

        if (typeErrors.length > 0) {
          if (options.json) {
            results.push({
              file: filePath,
              success: false,
              diagnostics:
                diagnosticFormatter.formatDiagnosticObjects(typeErrors),
            });
          } else {
            console.error(diagnosticFormatter.formatErrors(typeErrors));
          }
          errorCount++;
        } else {
          const elapsed = Date.now() - fileStartTime;
          if (options.json) {
            results.push({
              file: filePath,
              success: true,
              timeMs: elapsed,
            });
          } else if (!options.quiet) {
            if (options.time) {
              console.log(`✓ ${filePath} (${elapsed}ms)`);
            } else {
              console.log(`✓ ${filePath}`);
            }
          }
        }
      } else {
        // Basic type check without modules
        const typeErrors = checkSource(content, filePath, true);

        if (typeErrors.length > 0) {
          if (options.json) {
            results.push({
              file: filePath,
              success: false,
              diagnostics:
                diagnosticFormatter.formatDiagnosticObjects(typeErrors),
            });
          } else {
            console.error(diagnosticFormatter.formatErrors(typeErrors));
          }
          errorCount++;
        } else {
          const elapsed = Date.now() - fileStartTime;
          if (options.json) {
            results.push({
              file: filePath,
              success: true,
              timeMs: elapsed,
            });
          } else if (!options.quiet) {
            if (options.time) {
              console.log(`✓ ${filePath} (${elapsed}ms)`);
            } else {
              console.log(`✓ ${filePath}`);
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
      log.error(
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
