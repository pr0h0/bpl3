/**
 * Format Command Handler
 * Handles the `bpl format` command
 */

import * as fs from "fs";
import { Command } from "commander";
import { Parser, Formatter, lexWithGrammar } from "../../compiler";
import type { FormatOptions } from "../types";
import { Logger } from "../../compiler/common/Logger";
import { assertWritableInputFilePath, writeFileAtomically } from "../utils";

const log = new Logger("Format");

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
    .action((files: string[], options: FormatOptions) => {
      if (!files || files.length === 0) {
        log.error("No files specified.");
        process.exit(1);
      }
      if (options.write && options.check) {
        log.error("Cannot use --write and --check together.");
        process.exit(1);
      }

      let totalFiles = 0;
      let updatedFiles = 0;
      let hasError = false;
      let unformattedFiles = 0;

      for (const filePath of files) {
        totalFiles++;
        try {
          if (options.write) {
            assertWritableInputFilePath(filePath);
          } else if (!fs.existsSync(filePath)) {
            log.error(`File not found: ${filePath}`);
            hasError = true;
            continue;
          } else if (!fs.statSync(filePath).isFile()) {
            log.error(`Input path is not a file: ${filePath}`);
            hasError = true;
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
              log.error(`${filePath} is not formatted`);
            } else {
              log.info(`${filePath} is formatted`);
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
          log.error(
            `Error processing ${filePath}: ${e instanceof Error ? e.message : e}`,
          );
          hasError = true;
        }
      }

      if (options.write) {
        log.info(`Formatted ${totalFiles} files, ${updatedFiles} updated`);
      } else if (options.check && !hasError) {
        log.info(`All ${totalFiles} files are formatted`);
      } else if (options.check && unformattedFiles > 0) {
        log.error(`${unformattedFiles} of ${totalFiles} files are not formatted`);
      }

      if (hasError) process.exit(1);
    });
}
