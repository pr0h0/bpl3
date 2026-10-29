/**
 * Format command action.
 * Handles formatting after command registration.
 */

import * as fs from "fs";
import * as path from "path";
import { expandSourceInputs } from "../SourceInputs";
import type { Command } from "commander";
import type { FormatOptions } from "../types";
import {
  Logger,
  LogLevel,
  resetLogLevel,
  setLogLevel,
} from "../../compiler/common/Logger";
import { assertWritableInputFilePath, writeFileAtomically } from "../utils";
import { CompilerError } from "../../compiler/common/CompilerError";
import { diagnosticFormatter } from "../DiagnosticFormatter";
import {
  CLI_JSON_CHECKS,
  createJsonReport,
} from "../../compiler/common/JsonContracts";
import {
  FORMAT_INPUT_NOT_FILE_CODE,
  FORMAT_INPUT_NOT_FOUND_CODE,
  FORMAT_JSON_REQUIRES_CHECK_CODE,
  FORMAT_NOT_FORMATTED_CODE,
  FORMAT_NO_INPUTS_CODE,
  FORMAT_PROCESSING_ERROR_CODE,
  FORMAT_WRITE_CHECK_CONFLICT_CODE,
} from "./format";

const log = new Logger("Format");

let stdinLabel = "<stdin>";

/** How an input is named in human output; `-` reads standard input. */
function displayName(filePath: string): string {
  return filePath === "-" ? stdinLabel : filePath;
}

interface FormatFileReport {
  file: string;
  success: boolean;
  formatted: boolean;
  changed: boolean;
  error?: string;
  errorCode?: string;
}

export async function runFormatCommand(
  files: string[],
  options: FormatOptions,
  command: Command,
): Promise<void> {
  const globalOpts = command.parent?.opts() || {};
  const outputJson = Boolean(options.json || globalOpts.json);
  stdinLabel = options.stdinFilepath || "<stdin>";
  if (outputJson) {
    setLogLevel(LogLevel.SILENT);
  }

  try {
    if (outputJson && !options.check) {
      emitFormatJsonAndExit(
        createFormatJsonReport(false, {
          mode: options.write ? "write" : "stdout",
          totalFiles: files?.length ?? 0,
          formattedFiles: 0,
          unformattedFiles: 0,
          errorCount: 1,
          files: [],
          error: "--json is supported for format checks only.",
          errorCode: FORMAT_JSON_REQUIRES_CHECK_CODE,
        }),
      );
    }

    if (!files || files.length === 0) {
      exitNoFormatInputs(outputJson, "No files specified.");
    }
    if (options.write && options.check) {
      if (outputJson) {
        emitFormatJsonAndExit(
          createFormatJsonReport(false, {
            mode: "check",
            totalFiles: files.length,
            formattedFiles: 0,
            unformattedFiles: 0,
            errorCount: 1,
            files: [],
            error: "Cannot use --write and --check together.",
            errorCode: FORMAT_WRITE_CHECK_CONFLICT_CODE,
          }),
        );
      }
      log.error("Cannot use --write and --check together.");
      process.exit(1);
    }

    files = expandSourceInputs(files);
    if (!files.length) {
      exitNoFormatInputs(
        outputJson,
        "No BPL sources found in the supplied directories.",
      );
    }
    if (files.includes("-") && options.write)
      throw new Error(
        "Cannot use --write with stdin; redirect formatted output instead.",
      );
    const stdin = files.includes("-") ? fs.readFileSync(0, "utf8") : undefined;
    const { formatSource } = await import("./formatEngine");
    const { loadFormatterConfig } =
      await import("../../compiler/formatter/FormatterConfig");
    const { validateFormatterOptions } =
      await import("../../compiler/formatter/FormatterOptions");
    let totalFiles = 0;
    let updatedFiles = 0;
    let hasError = false;
    let unformattedFiles = 0;
    let formattedFiles = 0;
    let errorCount = 0;
    const fileReports: FormatFileReport[] = [];

    for (const filePath of files) {
      totalFiles++;
      try {
        if (filePath === "-") {
          // stdin has no on-disk input to validate.
        } else if (options.write) {
          assertWritableInputFilePath(filePath);
        } else if (!fs.existsSync(filePath)) {
          if (outputJson) {
            fileReports.push(
              formatFileFailure(
                filePath,
                "File not found",
                FORMAT_INPUT_NOT_FOUND_CODE,
              ),
            );
          }
          log.error(`File not found: ${filePath}`);
          hasError = true;
          errorCount++;
          continue;
        } else if (!fs.statSync(filePath).isFile()) {
          if (outputJson) {
            fileReports.push(
              formatFileFailure(
                filePath,
                "Input path is not a file",
                FORMAT_INPUT_NOT_FILE_CODE,
              ),
            );
          }
          log.error(`Input path is not a file: ${filePath}`);
          hasError = true;
          errorCount++;
          continue;
        }

        const sourcePath =
          filePath === "-"
            ? path.resolve(options.stdinFilepath || "stdin.bpl")
            : filePath;
        const project = loadFormatterConfig(sourcePath, options.config);
        const overrides = validateFormatterOptions({
          ...(options.indentWidth !== undefined
            ? { indentWidth: Number(options.indentWidth) }
            : {}),
          ...(options.useTabs !== undefined
            ? { useTabs: options.useTabs }
            : {}),
          ...(options.lineEnding !== undefined
            ? { lineEnding: options.lineEnding }
            : {}),
        });
        const content =
          filePath === "-" ? stdin! : fs.readFileSync(filePath, "utf-8");
        const formatted = formatSource(content, sourcePath, {
          ...project.options,
          ...overrides,
        });

        if (options.check) {
          if (content !== formatted) {
            unformattedFiles++;
            hasError = true;
            errorCount++;
            if (outputJson) {
              fileReports.push({
                file: filePath,
                success: false,
                formatted: false,
                changed: true,
                error: "File is not formatted",
                errorCode: FORMAT_NOT_FORMATTED_CODE,
              });
            } else {
              log.error(`${displayName(filePath)} is not formatted`);
            }
          } else {
            formattedFiles++;
            if (outputJson) {
              fileReports.push({
                file: filePath,
                success: true,
                formatted: true,
                changed: false,
              });
            } else {
              log.info(`${displayName(filePath)} is formatted`);
            }
          }
        } else if (options.write) {
          if (content !== formatted) {
            writeFileAtomically(filePath, formatted);
            updatedFiles++;
            log.info(`${filePath} (changed)`);
          } else {
            log.debug(`${filePath} (unchanged)`);
          }
        } else {
          process.stdout.write(formatted);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (outputJson) {
          fileReports.push(
            formatFileFailure(
              filePath,
              `Error processing ${filePath}: ${message}`,
              FORMAT_PROCESSING_ERROR_CODE,
            ),
          );
        } else if (e instanceof CompilerError) {
          // Show where the source fails to parse, as `check` does.
          console.error(diagnosticFormatter.formatError(e));
        } else {
          log.error(`Error processing ${displayName(filePath)}: ${message}`);
        }
        hasError = true;
        errorCount++;
      }
    }

    if (outputJson) {
      console.log(
        JSON.stringify(
          createFormatJsonReport(!hasError, {
            mode: "check",
            totalFiles,
            formattedFiles,
            unformattedFiles,
            errorCount,
            files: fileReports,
          }),
          null,
          2,
        ),
      );
    } else if (options.write) {
      log.info(`Formatted ${totalFiles} files, ${updatedFiles} updated`);
    } else if (options.check && !hasError) {
      log.info(`All ${totalFiles} files are formatted`);
    } else if (options.check && unformattedFiles > 0) {
      log.error(`${unformattedFiles} of ${totalFiles} files are not formatted`);
    }

    if (hasError) process.exit(1);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (outputJson)
      emitFormatJsonAndExit(
        createFormatJsonReport(false, {
          mode: options.check ? "check" : "stdout",
          totalFiles: files.length,
          formattedFiles: 0,
          unformattedFiles: 0,
          errorCount: 1,
          files: [],
          error: message,
          errorCode: FORMAT_PROCESSING_ERROR_CODE,
        }),
      );
    log.error(message);
    process.exit(1);
  } finally {
    if (outputJson) {
      resetLogLevel();
    }
  }
}

function exitNoFormatInputs(outputJson: boolean, message: string): never {
  if (outputJson) {
    emitFormatJsonAndExit(
      createFormatJsonReport(false, {
        mode: "check",
        totalFiles: 0,
        formattedFiles: 0,
        unformattedFiles: 0,
        errorCount: 1,
        files: [],
        error: message,
        errorCode: FORMAT_NO_INPUTS_CODE,
      }),
    );
  }
  log.error(message);
  process.exit(1);
}

function emitFormatJsonAndExit(
  report: ReturnType<typeof createFormatJsonReport>,
): never {
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
}

function createFormatJsonReport(
  success: boolean,
  payload: {
    mode: string;
    totalFiles: number;
    formattedFiles: number;
    unformattedFiles: number;
    errorCount: number;
    files: FormatFileReport[];
    error?: string;
    errorCode?: string;
  },
) {
  return createJsonReport(CLI_JSON_CHECKS.format, success, payload);
}

function formatFileFailure(
  file: string,
  error: string,
  errorCode: string,
): FormatFileReport {
  return {
    file,
    success: false,
    formatted: false,
    changed: false,
    error,
    errorCode,
  };
}
