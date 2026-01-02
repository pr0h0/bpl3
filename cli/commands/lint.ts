/**
 * Lint Command Handler
 * Handles the `bpl lint` command
 */

import * as fs from "fs";
import { Command } from "commander";
import { Parser, Linter, CompilerError, lexWithGrammar } from "../../compiler";
import { diagnosticFormatter } from "../DiagnosticFormatter";
import type { LintOptions } from "../types";

/**
 * Register the lint command
 */
export function registerLintCommand(program: Command): void {
  program
    .command("lint [files...]")
    .description("Lint BPL source files")
    .option("-v, --verbose", "enable verbose output")
    .action((files: string[], _options: LintOptions) => {
      if (!files || files.length === 0) {
        console.error("Error: No files specified.");
        process.exit(1);
      }

      const linter = new Linter();
      let hasErrors = false;

      for (const file of files) {
        try {
          if (!fs.existsSync(file)) {
            console.error(`Error: File not found: ${file}`);
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
            console.error(diagnosticFormatter.formatErrors(errors));
          }
        } catch (e) {
          hasErrors = true;
          if (e instanceof CompilerError) {
            console.error(diagnosticFormatter.formatError(e));
          } else {
            console.error(`Error processing ${file}: ${e}`);
          }
        }
      }

      if (hasErrors) {
        process.exit(1);
      }
    });
}
