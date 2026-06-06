/**
 * C bindgen command registrar.
 * Keeps header parsing and output dependencies out of CLI help startup.
 */

import type { Command } from "commander";

export {
  BINDGEN_FAILED_CODE,
  BINDGEN_HEADER_NOT_FILE_CODE,
  BINDGEN_HEADER_NOT_FOUND_CODE,
  BINDGEN_HEADER_PARENT_SYMLINK_CODE,
  BINDGEN_HEADER_SYMLINK_CODE,
  BINDGEN_JSON_ERROR_CODES,
  BINDGEN_OUTPUT_DIRECTORY_CODE,
  BINDGEN_OUTPUT_NOT_FILE_CODE,
  BINDGEN_OUTPUT_PARENT_NOT_DIRECTORY_CODE,
  BINDGEN_OUTPUT_PARENT_NOT_FOUND_CODE,
  BINDGEN_OUTPUT_PARENT_SYMLINK_CODE,
  BINDGEN_OUTPUT_SYMLINK_CODE,
} from "./BindgenContracts";

interface BindgenOptions {
  output?: string;
  json?: boolean;
}

export function registerBindgenCommand(program: Command): void {
  program
    .command("bindgen")
    .argument("<header>", "C header file to scan")
    .description("Generate BPL extern declarations from a C header")
    .option("-o, --output <file>", "write generated bindings to a file")
    .option("--json", "output a machine-readable bindgen report")
    .action(
      async (header: string, options: BindgenOptions, command: Command) => {
        const { runBindgenCommand } = await import("./bindgenAction");
        runBindgenCommand(header, options, command);
      },
    );
}
