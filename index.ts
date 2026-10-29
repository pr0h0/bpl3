#!/usr/bin/env node
/**
 * BPL Compiler CLI
 * Main entry point for the BPL command-line interface
 *
 * This file has been refactored to use modular command handlers.
 * See cli/ directory for individual command implementations.
 */

import { Command } from "commander";
import type { CompileOptions } from "./cli/types";
import { existsSync } from "fs";
import {
  emitBuildValidationErrorAndExit,
  emitNoInputBuildErrorAndExit,
  validateCompileInputSources,
} from "./cli/BuildInputValidation";
import { BUILD_INPUT_NOT_FOUND_CODE } from "./cli/BuildErrorCodes";
import {
  CLI_JSON_CHECKS,
  createJsonReport,
} from "./compiler/common/JsonContracts";
import { Logger } from "./compiler/common/Logger";
import { configureRootOptions } from "./cli/RootProgram";
import {
  registerRequestedCliSubcommands,
  suggestCliCommand,
} from "./cli/CommandRegistration";

const log = new Logger("CLI");

// `bpl format a.bpl b.bpl | head` closes stdout early; stop quietly instead
// of printing an EPIPE stack trace (BUG-442). A closed stderr is ignored so
// the command still exits with its own status (a failure stays a failure).
process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") process.exit(0);
  throw error;
});
process.stderr.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code !== "EPIPE") throw error;
});

const program = new Command();
const packageJson = require("./package.json");

handleJsonVersionRequest(process.argv, packageJson.version);

function handleJsonVersionRequest(argv: string[], version: string): void {
  const userArgs = argv.slice(2);
  const separatorIndex = userArgs.indexOf("--");
  const commandArgs =
    separatorIndex >= 0 ? userArgs.slice(0, separatorIndex) : userArgs;
  const wantsVersion =
    commandArgs.includes("--version") || commandArgs.includes("-V");
  const wantsJson = commandArgs.includes("--json");

  if (!wantsVersion || !wantsJson) {
    return;
  }

  console.log(
    JSON.stringify(
      createJsonReport(CLI_JSON_CHECKS.version, true, { version }),
      null,
      2,
    ),
  );
  process.exit(0);
}

// ============================================================================
// Program Configuration
// ============================================================================

program
  .name("bpl")
  .description(packageJson.description ?? "BPL3 Compiler")
  .version(packageJson.version);

// ============================================================================
// Main Compile Command (default action)
// ============================================================================

configureRootOptions(program)
  .action(async (files: string[] | undefined, options: CompileOptions) => {
    validateCompileInputSources(files, options);

    // Handle --eval flag
    if (options.eval !== undefined) {
      const { processCode } = await import("./cli/CompilationRunner");
      processCode(options.eval, "<eval>", options);
      return;
    }

    // Handle --stdin flag
    if (options.stdin) {
      const { processCode } = await import("./cli/CompilationRunner");
      const chunks: Buffer[] = [];
      process.stdin.on("data", (chunk) => chunks.push(chunk));
      process.stdin.on("end", () => {
        const code = Buffer.concat(chunks).toString("utf8");
        processCode(code, "<stdin>", options);
      });
      return;
    }

    if (!files || files.length === 0) {
      emitNoInputBuildErrorAndExit(options);
    }

    // TypeScript needs this assertion after the exit check
    const fileList = files as [string, ...string[]];

    rejectUnknownCommand(fileList[0], options);

    // Handle debug flag as alias for dwarf
    if (options.debug) {
      options.dwarf = true;
    }

    // Handle multiple files for formatting
    if (options.emit === "formatted") {
      const { processFile } = await import("./cli/CompilationRunner");
      let hasError = false;
      for (const filePath of fileList) {
        try {
          processFile(filePath, options);
        } catch (e) {
          log.error(`Error processing ${filePath}:`, { error: String(e) });
          hasError = true;
        }
      }
      if (hasError) process.exit(1);
      return;
    }

    // For non-formatting, extra files are program arguments
    const { processFileAsync } = await import("./cli/CompilationRunner");
    if (fileList.length > 1) {
      const programArgs = fileList.slice(1);
      await processFileAsync(fileList[0], options, programArgs);
      return;
    }

    await processFileAsync(fileList[0], options);
  });

/**
 * A bare word that is not an existing file and has no source extension is far
 * more likely a mistyped command than a program, so say that instead of
 * reporting a missing file.
 */
function rejectUnknownCommand(operand: string, options: CompileOptions): void {
  if (/[\\/.]/.test(operand) || existsSync(operand)) return;
  const suggestion = suggestCliCommand(operand);
  emitBuildValidationErrorAndExit(
    `Unknown command '${operand}'.` +
      (suggestion ? ` Did you mean '${suggestion}'?` : "") +
      " Run 'bpl --help' for the command list.",
    BUILD_INPUT_NOT_FOUND_CODE,
    options,
  );
}

// ============================================================================
// Subcommands
// ============================================================================

// Register only the requested subcommand group. Root help loads all groups so
// its command inventory and ordering remain stable.
registerRequestedCliSubcommands(
  program,
  process.argv.slice(2),
  packageJson.version,
)
  .then(() => program.parseAsync(process.argv))
  .catch((error: unknown) => {
    log.error(`${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
