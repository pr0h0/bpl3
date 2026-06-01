/**
 * Format Command Handler
 * Handles the `bpl format` command
 */

import * as fs from "fs";
import { Command } from "commander";
import { Parser, Formatter, lexWithGrammar } from "../../compiler";
import type { FormatOptions } from "../types";
import {
  Logger,
  LogLevel,
  resetLogLevel,
  setLogLevel,
} from "../../compiler/common/Logger";
import { assertWritableInputFilePath, writeFileAtomically } from "../utils";
import {
  CLI_JSON_CHECKS,
  createJsonReport,
} from "../../compiler/common/JsonContracts";

const log = new Logger("Format");

export const FORMAT_JSON_REQUIRES_CHECK_CODE =
  "BPL_FORMAT_JSON_REQUIRES_CHECK";
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

interface FormatFileReport {
  file: string;
  success: boolean;
  formatted: boolean;
  changed: boolean;
  error?: string;
  errorCode?: string;
}

/**
 * Register the format command
 */
export function registerFormatCommand(program: Command): void {
  program
    .command("format [files...]")
    .description("Format BPL source files")
    .option("-w, --write", "write formatted output back to file")
    .option("--check", "check whether files are formatted without writing")
    .option("-v, --verbose", "enable verbose output")
    .option("--json", "output machine-readable format check result")
    .action((files: string[], options: FormatOptions, command: Command) => {
      const globalOpts = command.parent?.opts() || {};
      const outputJson = Boolean(options.json || globalOpts.json);
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
          if (outputJson) {
            emitFormatJsonAndExit(
              createFormatJsonReport(false, {
                mode: "check",
                totalFiles: 0,
                formattedFiles: 0,
                unformattedFiles: 0,
                errorCount: 1,
                files: [],
                error: "No files specified.",
                errorCode: FORMAT_NO_INPUTS_CODE,
              }),
            );
          }
          log.error("No files specified.");
          process.exit(1);
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
            if (options.write) {
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

            const content = fs.readFileSync(filePath, "utf-8");
            const tokens = lexWithGrammar(content, filePath);
            const parser = new Parser(content, filePath, tokens);
            const ast = parser.parse(false);
            const formatter = new Formatter();
            const formatted = formatter.format(ast);

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
                  log.error(`${filePath} is not formatted`);
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
                  log.info(`${filePath} is formatted`);
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
              console.log(formatted);
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
            } else {
              log.error(`Error processing ${filePath}: ${message}`);
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
          log.error(
            `${unformattedFiles} of ${totalFiles} files are not formatted`,
          );
        }

        if (hasError) process.exit(1);
      } finally {
        if (outputJson) {
          resetLogLevel();
        }
      }
    });
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
