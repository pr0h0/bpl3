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
  processCode,
  registerFormatCommand,
  registerLintCommand,
  registerPackageCommands,
  registerCompletionCommand,
  registerDocsCommand,
} from "./cli";
import type { CompileOptions } from "./cli/types";

const program = new Command();
const packageJson = require("./package.json");

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
  .option("-g, --dwarf", "generate DWARF debug information")
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
  .option("-l, --lib <lib...>", "libraries to link with")
  .option("-L, --lib-path <path...>", "library search paths")
  .option("--object <file...>", "object files to link (.o, .ll, etc.)")
  .option("--run", "run the generated code")
  .option("-v, --verbose", "enable verbose output")
  .option("--cache", "enable incremental compilation with module caching")
  .option("--write", "write formatted output back to file (only for formatted)")
  .option("--no-prelude", "do not load implicit primitives")
  .action((files: string[] | undefined, options: CompileOptions) => {
    // Handle --eval option
    if ((options as any).eval) {
      processCode((options as any).eval, "eval-42069", options);
      return;
    }

    // Handle --stdin option
    if (options.stdin) {
      let stdinData = "";
      process.stdin.setEncoding("utf-8");

      process.stdin.on("data", (chunk) => {
        stdinData += chunk;
      });

      process.stdin.on("end", () => {
        processCode(stdinData, "stdin-42069", options);
      });

      return;
    }

    // Handle regular file arguments
    if (!files || files.length === 0) {
      console.error("Error: No input files specified");
      process.exit(1);
    }

    // TypeScript needs this assertion after the exit check
    const fileList = files as [string, ...string[]];

    // Handle multiple files for formatting
    if (options.emit === "formatted") {
      let hasError = false;
      for (const filePath of fileList) {
        try {
          processFile(filePath, options);
        } catch (e) {
          console.error(`Error processing ${filePath}: ${e}`);
          hasError = true;
        }
      }
      if (hasError) process.exit(1);
      return;
    }

    // For non-formatting, extra files are program arguments
    if (fileList.length > 1) {
      const programArgs = fileList.slice(1);
      processFile(fileList[0], options, programArgs);
      return;
    }

    processFile(fileList[0], options);
  });

// ============================================================================
// Subcommands
// ============================================================================

// Register all subcommands from cli/commands/
registerFormatCommand(program);
registerLintCommand(program);
registerPackageCommands(program);
registerCompletionCommand(program);
registerDocsCommand(program);

// ============================================================================
// Parse and Execute
// ============================================================================

program.parse(process.argv);
