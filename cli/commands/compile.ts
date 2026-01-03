/**
 * Compile Command Handler
 * Handles the main compile action with file arguments
 */

import { Command } from "commander";
import { processFile, processCode } from "../CompilationRunner";
import type { CompileOptions } from "../types";
import { Logger } from "../../compiler/common/Logger";

const log = new Logger("Compile");

/**
 * Register compile command options and action on the main program
 * This is not a subcommand but the default action
 */
export function registerCompileCommand(program: Command): void {
  program.action((files: string[] | undefined, options: CompileOptions) => {
    // Handle --stdin option
    if (options.stdin) {
      let stdinData = "";
      process.stdin.setEncoding("utf-8");

      process.stdin.on("data", (chunk) => {
        stdinData += chunk;
      });

      process.stdin.on("end", () => {
        processCode(stdinData, "stdin-42069", options);
      });

      return;
    }

    // Handle regular file arguments
    if (!files || files.length === 0) {
      log.error("No input files specified");
      process.exit(1);
    }

    // TypeScript needs this assertion after the exit check
    const fileList = files as [string, ...string[]];

    if (options.emit === "formatted") {
      let hasError = false;
      for (const filePath of fileList) {
        try {
          processFile(filePath, options);
        } catch (e) {
          log.error(`Error processing ${filePath}: ${e}`);
          hasError = true;
        }
      }
      if (hasError) process.exit(1);
      return;
    }

    if (fileList.length > 1) {
      // If not formatting, treat extra files as arguments for the program
      const programArgs = fileList.slice(1);
      processFile(fileList[0], options, programArgs);
      return;
    }

    processFile(fileList[0], options);
  });
}
