#!/usr/bin/env node
/**
 * BPL Compiler CLI
 * Main entry point for the BPL command-line interface
 *
 * This file has been refactored to use modular command handlers.
 * See cli/ directory for individual command implementations.
 */

import { Command } from "commander";
import {
  processFile,
  processFileAsync,
  processCode,
  registerFormatCommand,
  registerLintCommand,
  registerPackageCommands,
  registerCompletionCommand,
  registerDocsCommand,
  registerRunCommand,
  registerDevCommand,
  registerBuildCommand,
  registerCheckCommand,
  registerNewCommand,
  registerCleanCommand,
  registerRunScriptCommand,
  registerBindgenCommand,
  registerDoctorCommand,
} from "./cli";
import type { CompileOptions } from "./cli/types";
import {
  CLI_JSON_CHECKS,
  createJsonReport,
} from "./compiler/common/JsonContracts";
import { Logger } from "./compiler/common/Logger";

const log = new Logger("CLI");

const program = new Command();
const packageJson = require("./package.json");
const BUILD_NO_INPUTS_CODE = "BPL_BUILD_NO_INPUTS";

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

function emitBuildNoInputsJsonAndExit(): never {
  console.log(
    JSON.stringify(
      createJsonReport(CLI_JSON_CHECKS.build, false, {
        error: "No input files specified.",
        errorCode: BUILD_NO_INPUTS_CODE,
      }),
      null,
      2,
    ),
  );
  process.exit(1);
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

program
  .argument("[files...]", "source file(s) to compile")
  .option("-e, --eval <code>", "evaluate BPL code passed as string")
  .option("--stdin", "read BPL code from stdin")
  .option("-o, --output <file>", "output file path")
  .option("--emit <type>", "emit type: llvm, ast, tokens, formatted", "llvm")
  .option("-d, --dwarf", "generate DWARF debug information")
  .option(
    "--target <triple>",
    "target triple for clang (e.g. x86_64-pc-windows-gnu)",
  )
  .option("--sysroot <path>", "sysroot path for cross-compilation")
  .option("--cpu <cpu>", "target CPU for clang (e.g. znver4)")
  .option("--march <arch>", "target architecture for clang (e.g. arm64)")
  .option(
    "--clang-flag <flag...>",
    "additional flags forwarded directly to clang",
  )
  .option(
    "--wasm-runtime <mode>",
    "wasm runtime mode: freestanding or host",
  )
  .option("-l, --lib <lib...>", "libraries to link with")
  .option("-L, --lib-path <path...>", "library search paths")
  .option("--object <file...>", "object files to link (.o, .ll, etc.)")
  .option("-v, --verbose", "enable verbose output")
  .option("-q, --quiet", "suppress non-error output")
  .option("--cache", "enable incremental compilation with module caching")
  .option("--cache-stats", "show incremental cache hit/miss statistics")
  .option(
    "-j, --jobs <count>",
    "parallel module compilation jobs for cached builds",
  )
  .option("--no-prelude", "do not load implicit primitives")
  .option("-O <level>", "optimization level: 0, 1, 2, or 3", "0")
  .option("--debug", "generate debug information (DWARF, alias for --dwarf)")
  .option("--time", "show compilation time statistics")
  .option("--json", "output in JSON format")
  .option("--color", "force colored output")
  .option("--no-color", "disable colored output")
  .action(async (files: string[] | undefined, options: CompileOptions) => {
    // Handle --eval flag
    if (options.eval) {
      processCode(options.eval, "<eval>", options);
      return;
    }

    // Handle --stdin flag
    if (options.stdin) {
      const chunks: Buffer[] = [];
      process.stdin.on("data", (chunk) => chunks.push(chunk));
      process.stdin.on("end", () => {
        const code = Buffer.concat(chunks).toString("utf8");
        processCode(code, "<stdin>", options);
      });
      return;
    }

    if (!files || files.length === 0) {
      if (options.json) {
        emitBuildNoInputsJsonAndExit();
      }
      log.error("No input files specified");
      process.exit(1);
    }

    // TypeScript needs this assertion after the exit check
    const fileList = files as [string, ...string[]];

    // Handle debug flag as alias for dwarf
    if (options.debug) {
      options.dwarf = true;
    }

    // Handle multiple files for formatting
    if (options.emit === "formatted") {
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
    if (fileList.length > 1) {
      const programArgs = fileList.slice(1);
      await processFileAsync(fileList[0], options, programArgs);
      return;
    }

    await processFileAsync(fileList[0], options);
  });

// ============================================================================
// Subcommands
// ============================================================================

// Register all subcommands from cli/commands/
registerRunCommand(program);
registerRunScriptCommand(program);
registerDevCommand(program);
registerBuildCommand(program);
registerCheckCommand(program);
registerFormatCommand(program);
registerLintCommand(program);
registerPackageCommands(program);
registerCompletionCommand(program);
registerDocsCommand(program);
registerNewCommand(program);
registerCleanCommand(program);
registerBindgenCommand(program);
registerDoctorCommand(program, packageJson.version);

// ============================================================================
// Parse and Execute
// ============================================================================

program.parseAsync(process.argv).catch((error: unknown) => {
  log.error(`${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
