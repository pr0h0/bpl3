/**
 * C bindgen command.
 * Generates conservative BPL extern declarations from simple C headers.
 */

import * as fs from "fs";
import { Command } from "commander";
import { generateBplBindings } from "../../compiler/tools/CBindgen";
import { Logger } from "../../compiler/common/Logger";

const log = new Logger("Bindgen");

export function registerBindgenCommand(program: Command): void {
  program
    .command("bindgen")
    .argument("<header>", "C header file to scan")
    .description("Generate BPL extern declarations from a C header")
    .option("-o, --output <file>", "write generated bindings to a file")
    .action((header: string, options: { output?: string }) => {
      try {
        const output = generateBplBindings({ headerPath: header });
        if (options.output) {
          fs.writeFileSync(options.output, output);
          log.info(`Bindings written to ${options.output}`);
          return;
        }

        process.stdout.write(output);
      } catch (error) {
        log.error(`${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });
}

