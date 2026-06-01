/**
 * Docs Command Handler
 * Generates Markdown documentation for BPL files
 */

import { Command } from "commander";
import { DocumentationGenerator } from "../../compiler/docs/DocumentationGenerator";
import { Logger } from "../../compiler/common/Logger";
import { assertWritableFileOutputPath, writeFileAtomically } from "../utils";
import {
  CLI_JSON_CHECKS,
  createJsonReport,
} from "../../compiler/common/JsonContracts";

const log = new Logger("Docs");

export const DOCS_INPUT_NOT_FOUND_CODE = "BPL_DOCS_INPUT_NOT_FOUND";
export const DOCS_INPUT_SYMLINK_CODE = "BPL_DOCS_INPUT_SYMLINK";
export const DOCS_INPUT_NOT_FILE_CODE = "BPL_DOCS_INPUT_NOT_FILE";
export const DOCS_INPUT_PARENT_SYMLINK_CODE =
  "BPL_DOCS_INPUT_PARENT_SYMLINK";
export const DOCS_OUTPUT_SYMLINK_CODE = "BPL_DOCS_OUTPUT_SYMLINK";
export const DOCS_OUTPUT_DIRECTORY_CODE = "BPL_DOCS_OUTPUT_DIRECTORY";
export const DOCS_OUTPUT_NOT_FILE_CODE = "BPL_DOCS_OUTPUT_NOT_FILE";
export const DOCS_OUTPUT_PARENT_NOT_FOUND_CODE =
  "BPL_DOCS_OUTPUT_PARENT_NOT_FOUND";
export const DOCS_OUTPUT_PARENT_SYMLINK_CODE =
  "BPL_DOCS_OUTPUT_PARENT_SYMLINK";
export const DOCS_OUTPUT_PARENT_NOT_DIRECTORY_CODE =
  "BPL_DOCS_OUTPUT_PARENT_NOT_DIRECTORY";
export const DOCS_FAILED_CODE = "BPL_DOCS_FAILED";
export const DOCS_JSON_ERROR_CODES = [
  DOCS_INPUT_NOT_FOUND_CODE,
  DOCS_INPUT_SYMLINK_CODE,
  DOCS_INPUT_NOT_FILE_CODE,
  DOCS_INPUT_PARENT_SYMLINK_CODE,
  DOCS_OUTPUT_SYMLINK_CODE,
  DOCS_OUTPUT_DIRECTORY_CODE,
  DOCS_OUTPUT_NOT_FILE_CODE,
  DOCS_OUTPUT_PARENT_NOT_FOUND_CODE,
  DOCS_OUTPUT_PARENT_SYMLINK_CODE,
  DOCS_OUTPUT_PARENT_NOT_DIRECTORY_CODE,
  DOCS_FAILED_CODE,
] as const;

interface DocsOptions {
  output?: string;
  json?: boolean;
}

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
    .option("--json", "output a machine-readable documentation report")
    .action((file: string, options: DocsOptions, command: Command) => {
      const globalOpts = command.parent?.opts() || {};
      const outputJson = Boolean(options.json || globalOpts.json);
      const outputPath = options.output || globalOpts.output || "docs.md";

      try {
        const generator = new DocumentationGenerator();
        const markdown = generator.generate(file);

        assertWritableFileOutputPath(outputPath);
        writeFileAtomically(outputPath, markdown);
        if (outputJson) {
          emitDocsJsonReport(
            createDocsJsonReport(true, {
              file,
              outputPath,
              generatedBytes: Buffer.byteLength(markdown, "utf8"),
            }),
          );
          return;
        }
        log.info(`Documentation generated at ${outputPath}`);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        if (outputJson) {
          emitDocsJsonReport(
            createDocsJsonReport(false, {
              file,
              outputPath,
              error: message,
              errorCode: getDocsErrorCode(message),
            }),
          );
          process.exit(1);
        }
        log.error("Error generating documentation:", { error: message });
        process.exit(1);
      }
    });
}

function createDocsJsonReport(
  success: boolean,
  payload: {
    file: string;
    outputPath: string;
    generatedBytes?: number;
    error?: string;
    errorCode?: string;
  },
) {
  return createJsonReport(CLI_JSON_CHECKS.docs, success, payload);
}

function emitDocsJsonReport(
  report: ReturnType<typeof createDocsJsonReport>,
): void {
  console.log(JSON.stringify(report, null, 2));
}

function getDocsErrorCode(message: string): string {
  if (message.startsWith("Documentation input not found:")) {
    return DOCS_INPUT_NOT_FOUND_CODE;
  }
  if (message.startsWith("Documentation input is a symbolic link:")) {
    return DOCS_INPUT_SYMLINK_CODE;
  }
  if (message.startsWith("Documentation input is not a file:")) {
    return DOCS_INPUT_NOT_FILE_CODE;
  }
  if (
    message.startsWith("Documentation input parent contains a symbolic link:")
  ) {
    return DOCS_INPUT_PARENT_SYMLINK_CODE;
  }
  if (message.startsWith("Output path is a symbolic link:")) {
    return DOCS_OUTPUT_SYMLINK_CODE;
  }
  if (message.startsWith("Output path is a directory:")) {
    return DOCS_OUTPUT_DIRECTORY_CODE;
  }
  if (message.startsWith("Output path is not a regular file:")) {
    return DOCS_OUTPUT_NOT_FILE_CODE;
  }
  if (message.startsWith("Output directory not found:")) {
    return DOCS_OUTPUT_PARENT_NOT_FOUND_CODE;
  }
  if (
    message.startsWith("Output parent path is a symbolic link:") ||
    message.startsWith("Output parent path contains a symbolic link:")
  ) {
    return DOCS_OUTPUT_PARENT_SYMLINK_CODE;
  }
  if (message.startsWith("Output parent path is not a directory:")) {
    return DOCS_OUTPUT_PARENT_NOT_DIRECTORY_CODE;
  }

  return DOCS_FAILED_CODE;
}
