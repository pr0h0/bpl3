/**
 * Docs Command Handler
 * Generates Markdown documentation for BPL files
 */

import * as fs from "fs";
import { Command } from "commander";
import { DocumentationGenerator } from "../../compiler/docs/DocumentationGenerator";

/**
 * Register the docs command
 */
export function registerDocsCommand(program: Command): void {
  program
    .command("docs")
    .argument("<file>", "Input BPL file")
    .description(
      "Generate Markdown documentation for a BPL file and its imports",
    )
    .option("-o, --output <file>", "Output file path (default: docs.md)")
    .action((file: string, options: { output?: string }, command: Command) => {
      try {
        const generator = new DocumentationGenerator();
        const markdown = generator.generate(file);

        const globalOpts = command.parent?.opts() || {};
        const outputPath = options.output || globalOpts.output || "docs.md";

        fs.writeFileSync(outputPath, markdown);
        console.log(`Documentation generated at ${outputPath}`);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("Error generating documentation:", message);
        process.exit(1);
      }
    });
}
