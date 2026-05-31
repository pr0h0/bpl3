/**
 * C bindgen command.
 * Generates conservative BPL extern declarations from simple C headers.
 */

import { Command } from "commander";
import { generateBplBindings } from "../../compiler/tools/CBindgen";
import { Logger } from "../../compiler/common/Logger";
import { assertWritableFileOutputPath, writeFileAtomically } from "../utils";
import {
  CLI_JSON_CHECKS,
  createJsonReport,
} from "../../compiler/common/JsonContracts";

const log = new Logger("Bindgen");

export const BINDGEN_HEADER_NOT_FOUND_CODE = "BPL_BINDGEN_HEADER_NOT_FOUND";
export const BINDGEN_HEADER_SYMLINK_CODE = "BPL_BINDGEN_HEADER_SYMLINK";
export const BINDGEN_HEADER_NOT_FILE_CODE = "BPL_BINDGEN_HEADER_NOT_FILE";
export const BINDGEN_HEADER_PARENT_SYMLINK_CODE =
  "BPL_BINDGEN_HEADER_PARENT_SYMLINK";
export const BINDGEN_OUTPUT_SYMLINK_CODE = "BPL_BINDGEN_OUTPUT_SYMLINK";
export const BINDGEN_OUTPUT_DIRECTORY_CODE = "BPL_BINDGEN_OUTPUT_DIRECTORY";
export const BINDGEN_OUTPUT_NOT_FILE_CODE = "BPL_BINDGEN_OUTPUT_NOT_FILE";
export const BINDGEN_OUTPUT_PARENT_NOT_FOUND_CODE =
  "BPL_BINDGEN_OUTPUT_PARENT_NOT_FOUND";
export const BINDGEN_OUTPUT_PARENT_SYMLINK_CODE =
  "BPL_BINDGEN_OUTPUT_PARENT_SYMLINK";
export const BINDGEN_OUTPUT_PARENT_NOT_DIRECTORY_CODE =
  "BPL_BINDGEN_OUTPUT_PARENT_NOT_DIRECTORY";
export const BINDGEN_FAILED_CODE = "BPL_BINDGEN_FAILED";

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
    .action((header: string, options: BindgenOptions, command: Command) => {
      const globalOpts = command.parent?.opts() || {};
      const outputJson = Boolean(options.json || globalOpts.json);
      const outputPath = options.output || globalOpts.output || null;

      try {
        const output = generateBplBindings({ headerPath: header });
        if (outputPath) {
          assertWritableFileOutputPath(outputPath);
          writeFileAtomically(outputPath, output);
          if (outputJson) {
            emitBindgenJsonReport(
              createBindgenJsonReport(true, {
                header,
                outputPath,
                generatedBytes: Buffer.byteLength(output, "utf8"),
              }),
            );
            return;
          }
          log.info(`Bindings written to ${outputPath}`);
          return;
        }

        if (outputJson) {
          emitBindgenJsonReport(
            createBindgenJsonReport(true, {
              header,
              outputPath,
              generatedBytes: Buffer.byteLength(output, "utf8"),
              bindings: output,
            }),
          );
          return;
        }

        process.stdout.write(output);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (outputJson) {
          emitBindgenJsonReport(
            createBindgenJsonReport(false, {
              header,
              outputPath,
              error: message,
              errorCode: getBindgenErrorCode(message),
            }),
          );
          process.exit(1);
        }
        log.error(message);
        process.exit(1);
      }
    });
}

function createBindgenJsonReport(
  success: boolean,
  payload: {
    header: string;
    outputPath: string | null;
    generatedBytes?: number;
    bindings?: string;
    error?: string;
    errorCode?: string;
  },
) {
  return createJsonReport(CLI_JSON_CHECKS.bindgen, success, payload);
}

function emitBindgenJsonReport(
  report: ReturnType<typeof createBindgenJsonReport>,
): void {
  console.log(JSON.stringify(report, null, 2));
}

function getBindgenErrorCode(message: string): string {
  if (message.startsWith("Header file not found:")) {
    return BINDGEN_HEADER_NOT_FOUND_CODE;
  }
  if (message.startsWith("Header path is a symbolic link:")) {
    return BINDGEN_HEADER_SYMLINK_CODE;
  }
  if (message.startsWith("Header path is not a file:")) {
    return BINDGEN_HEADER_NOT_FILE_CODE;
  }
  if (message.startsWith("Header parent path contains a symbolic link:")) {
    return BINDGEN_HEADER_PARENT_SYMLINK_CODE;
  }
  if (message.startsWith("Output path is a symbolic link:")) {
    return BINDGEN_OUTPUT_SYMLINK_CODE;
  }
  if (message.startsWith("Output path is a directory:")) {
    return BINDGEN_OUTPUT_DIRECTORY_CODE;
  }
  if (message.startsWith("Output path is not a regular file:")) {
    return BINDGEN_OUTPUT_NOT_FILE_CODE;
  }
  if (message.startsWith("Output directory not found:")) {
    return BINDGEN_OUTPUT_PARENT_NOT_FOUND_CODE;
  }
  if (
    message.startsWith("Output parent path is a symbolic link:") ||
    message.startsWith("Output parent path contains a symbolic link:")
  ) {
    return BINDGEN_OUTPUT_PARENT_SYMLINK_CODE;
  }
  if (message.startsWith("Output parent path is not a directory:")) {
    return BINDGEN_OUTPUT_PARENT_NOT_DIRECTORY_CODE;
  }

  return BINDGEN_FAILED_CODE;
}
