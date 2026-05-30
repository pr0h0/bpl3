/**
 * C bindgen command.
 * Generates conservative BPL extern declarations from simple C headers.
 */

import { Command } from "commander";
import { generateBplBindings } from "../../compiler/tools/CBindgen";
import { Logger } from "../../compiler/common/Logger";
import { assertWritableFileOutputPath, writeFileAtomically } from "../utils";

const log = new Logger("Bindgen");

export function registerBindgenCommand(program: Command): void {
  program
    .command("bindgen")
    .argument("<header>", "C header file to scan")
    .description("Generate BPL extern declarations from a C header")
    .option("-o, --output <file>", "write generated bindings to a file")
    .action((header: string, options: { output?: string }, command: Command) => {
      try {
        const output = generateBplBindings({ headerPath: header });
        const globalOpts = command.parent?.opts() || {};
        const outputPath = options.output || globalOpts.output;
        if (outputPath) {
          assertWritableFileOutputPath(outputPath);
          writeFileAtomically(outputPath, output);
          log.info(`Bindings written to ${outputPath}`);
          return;
        }

        process.stdout.write(output);
      } catch (error) {
        log.error(`${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });
}
