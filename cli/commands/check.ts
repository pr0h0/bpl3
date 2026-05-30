/**
 * Check Command Handler
 * Fast type checking without code generation
 */

import * as fs from "fs";
import { Command } from "commander";
import {
  Parser,
  TypeChecker,
  CompilerError,
  lexWithGrammar,
} from "../../compiler";
import { diagnosticFormatter } from "../DiagnosticFormatter";
import { getInputFilePathError } from "../utils";
import { Logger, LogLevel, setLogLevel } from "../../compiler/common/Logger";
import { updateConfig } from "../../compiler/common/Config";

const log = new Logger("Check");

/**
 * Register the check command
 *
 * The `check` command performs type checking without generating code.
 * It's much faster than full compilation and perfect for CI/CD pipelines
 * or quick feedback during development.
 *
 * Examples:
 *   bpl check main.bpl
 *   bpl check file1.bpl file2.bpl
 *   bpl check main.bpl -v
 *   bpl check main.bpl --json
 *   bpl check main.bpl --time
 */
export function registerCheckCommand(program: Command): void {
  program
    .command("check")
    .argument("<files...>", "BPL files to type check")
    .description("Type check BPL files without generating code (fast)")
    .option("-v, --verbose", "enable verbose output")
    .option("-q, --quiet", "suppress non-error output")
    .option("--json", "output results in JSON format")
    .option("--time", "show type checking time statistics")
    .option("--no-prelude", "do not load implicit primitives")
    .option("--color", "force colored output")
    .option("--no-color", "disable colored output")
    .action((files: string[], rawOptions: any, command: Command) => {
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
              });
            } else {
              log.error(`${inputError}: ${filePath}`);
            }
            errorCount++;
            continue;
          }

          const fileStartTime = Date.now();

          // Read and lex
          const content = fs.readFileSync(filePath, "utf-8");
          const tokens = lexWithGrammar(content, filePath);

          // Parse
          const parser = new Parser(content, filePath, tokens);
          const ast = parser.parse(false);

          // Type check (with modules if not --no-prelude)
          if (options.prelude !== false) {
            const typeChecker = new TypeChecker({
              skipImportResolution: false,
              collectAllErrors: true,
            });
            typeChecker.checkProgram(ast);
            const typeErrors = typeChecker.getErrors();

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
            const typeChecker = new TypeChecker({
              skipImportResolution: true,
              collectAllErrors: true,
            });
            typeChecker.checkProgram(ast);
            const typeErrors = typeChecker.getErrors();

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
            {
              success: errorCount === 0,
              totalFiles,
              errorCount,
              timeMs: totalTime,
              files: results,
            },
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
            console.log(
              `\n✓ All ${totalFiles} files type checked successfully`,
            );
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
    });
}
