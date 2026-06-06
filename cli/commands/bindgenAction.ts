/**
 * C bindgen action.
 * Generates conservative BPL extern declarations from simple C headers.
 */

import type { Command } from "commander";
import { generateBplBindings } from "../../compiler/tools/CBindgen";
import { Logger } from "../../compiler/common/Logger";
import { assertWritableFileOutputPath, writeFileAtomically } from "../utils";
import {
  CLI_JSON_CHECKS,
  createJsonReport,
} from "../../compiler/common/JsonContracts";
import {
  BINDGEN_FAILED_CODE,
  BINDGEN_HEADER_NOT_FILE_CODE,
  BINDGEN_HEADER_NOT_FOUND_CODE,
  BINDGEN_HEADER_PARENT_SYMLINK_CODE,
  BINDGEN_HEADER_SYMLINK_CODE,
  BINDGEN_OUTPUT_DIRECTORY_CODE,
  BINDGEN_OUTPUT_NOT_FILE_CODE,
  BINDGEN_OUTPUT_PARENT_NOT_DIRECTORY_CODE,
  BINDGEN_OUTPUT_PARENT_NOT_FOUND_CODE,
  BINDGEN_OUTPUT_PARENT_SYMLINK_CODE,
  BINDGEN_OUTPUT_SYMLINK_CODE,
} from "./BindgenContracts";

const log = new Logger("Bindgen");

interface BindgenOptions {
  output?: string;
  json?: boolean;
}

export function runBindgenCommand(
  header: string,
  options: BindgenOptions,
  command: Command,
): void {
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
