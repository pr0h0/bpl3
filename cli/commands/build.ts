/**
 * Build Command Handler
 * Explicit compilation command for building BPL programs
 */

import * as fs from "fs";
import { resolveProjectEntry } from "../ProjectEntry";
import type { Command } from "commander";
import type { CompileOptions } from "../types";
import { Logger } from "../../compiler/common/Logger";
import { getExplicitParentCompileOptions } from "./compileOptions";
import {
  validateCompileInputSources,
  emitBuildValidationErrorAndExit,
  emitNoInputBuildErrorAndExit,
} from "../BuildInputValidation";
import { BUILD_PROJECT_ENTRY_INVALID_CODE } from "../BuildErrorCodes";

const log = new Logger("Build");

export function shouldUseFrontendBuildAction(options: CompileOptions): boolean {
  if (
    options.emit !== "tokens" &&
    options.emit !== "ast" &&
    options.emit !== "formatted"
  ) {
    return false;
  }

  return (
    (options.O === undefined || options.O === "0") &&
    options.output === undefined &&
    options.target === undefined &&
    options.sysroot === undefined &&
    options.cpu === undefined &&
    options.march === undefined &&
    options.lib === undefined &&
    options.libPath === undefined &&
    options.object === undefined &&
    options.clangFlag === undefined &&
    options.wasmRuntime === undefined &&
    options.debugIrPath === undefined &&
    !options.shared &&
    options.header === undefined &&
    !options.run &&
    !options.cache &&
    !options.cacheStats &&
    options.jobs === undefined &&
    options.prelude !== false &&
    !options.dwarf &&
    !options.debug &&
    !options.stdin &&
    options.eval === undefined &&
    !options.watch &&
    !options.time &&
    !options.clear &&
    !options.noRun &&
    !options.skipRuntime
  );
}

/**
 * Register the build command
 *
 * The `build` command is an explicit way to compile BPL files.
 * It's more discoverable than the default action and makes intent clearer.
 *
 * Examples:
 *   bpl build main.bpl
 *   bpl build main.bpl -o output
 *   bpl build main.bpl -O3 --debug
 *   bpl build main.bpl --target x86_64-pc-windows-gnu
 *   bpl build main.bpl --emit llvm -v
 */
export function registerBuildCommand(program: Command): void {
  program
    .command("build")
    .argument("[file]", "BPL file to compile")
    .description("Compile a BPL program")
    .option("-o, --output <file>", "output file path")
    .option(
      "--shared",
      "build a native shared library (requires -o, no main required)",
    )
    .option(
      "--header <file>",
      "write a C header for c_export functions (requires --shared)",
    )
    .option("--emit <type>", "emit type: llvm, ast, tokens, formatted")
    .option(
      "--project",
      "use main/entry from ./bpl.json (implied when no file is given)",
    )
    .option("-v, --verbose", "enable verbose output")
    .option("-q, --quiet", "suppress non-error output")
    .option("-O <level>", "optimization level: 0, 1, 2, or 3")
    .option("--debug", "generate debug information (DWARF)")
    .option("--time", "show compilation time statistics")
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
    .option("--wasm-runtime <mode>", "wasm runtime mode: freestanding or host")
    .option("--debug-ir-path <file>", "write diagnostic LLVM IR to a file")
    .option("-l, --lib <lib...>", "libraries to link with")
    .option("-L, --lib-path <path...>", "library search paths")
    .option("--object <file...>", "object files to link (.o, .ll, etc.)")
    .option("--cache", "enable incremental compilation with module caching")
    .option("--cache-stats", "show incremental cache hit/miss statistics")
    .option(
      "-j, --jobs <count>",
      "parallel module compilation jobs for cached builds",
    )
    .option("--no-prelude", "do not load implicit primitives")
    .option("--color", "force colored output")
    .option("--no-color", "disable colored output")
    .option("--json", "output in JSON format")
    .action(
      async (
        file: string | undefined,
        _options: CompileOptions,
        command: Command,
      ) => {
        try {
          // Merge parent options if any
          const globalOpts = getExplicitParentCompileOptions(command);
          const localOpts = command.opts<CompileOptions>();
          const compileOptions: CompileOptions = {
            ...globalOpts,
            ...localOpts,
            dwarf:
              localOpts.debug ||
              localOpts.dwarf ||
              globalOpts.debug ||
              globalOpts.dwarf,
          };
          // Outside a project, keep the structured no-input error; inside
          // one, a file-less build uses the bpl.json entry.
          if (!file && !localOpts.project && !fs.existsSync("bpl.json"))
            emitNoInputBuildErrorAndExit(compileOptions);
          try {
            file = resolveProjectEntry(file, localOpts.project);
          } catch (error) {
            // Manifest and entry problems use the structured build report.
            emitBuildValidationErrorAndExit(
              error instanceof Error ? error.message : String(error),
              BUILD_PROJECT_ENTRY_INVALID_CODE,
              compileOptions,
            );
          }
          validateCompileInputSources([file], compileOptions);

          if (shouldUseFrontendBuildAction(compileOptions)) {
            const { processFrontendBuildFile } =
              await import("./frontendBuildAction");
            processFrontendBuildFile(file, compileOptions);
            return;
          }

          const { processFileAsync } = await import("../CompilationRunner");
          await processFileAsync(file, compileOptions);
        } catch (e) {
          log.error(`${e instanceof Error ? e.message : String(e)}`);
          process.exit(1);
        }
      },
    );
}
