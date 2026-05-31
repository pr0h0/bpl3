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
              errorCode: "BPL_FORMAT_JSON_REQUIRES_CHECK",
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
                errorCode: "BPL_FORMAT_NO_INPUTS",
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
                errorCode: "BPL_FORMAT_WRITE_CHECK_CONFLICT",
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
                    "BPL_FORMAT_INPUT_NOT_FOUND",
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
                    "BPL_FORMAT_INPUT_NOT_FILE",
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
                    errorCode: "BPL_FORMAT_NOT_FORMATTED",
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
                  "BPL_FORMAT_PROCESSING_ERROR",
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
