/**
 * Binary Runner
 * Handles compilation of LLVM IR to executable and execution
 */

import { spawnSync } from "child_process";
import * as path from "path";
import * as fs from "fs";
import type { CompileOptions } from "./types";
import { getHostDefaults, normalizeArrayOption } from "./utils";
import { Logger } from "../compiler/common/Logger";
import { getBplHome } from "../compiler/common/PathResolver";

const log = new Logger("BinaryRunner");

/**
 * Result of binary compilation
 */
export interface CompileResult {
  success: boolean;
  executablePath?: string;
  error?: string;
}

/**
 * Result of program execution
 */
export interface RunResult {
  success: boolean;
  exitCode: number;
}

/**
 * Compile LLVM IR to a native executable using clang
 */
export function compileToBinary(
  irPath: string,
  options: CompileOptions,
): CompileResult {
  const execPathBase = irPath.replace(/\.ll$/, "");
  const execPath = path.isAbsolute(execPathBase)
    ? execPathBase
    : path.resolve(execPathBase);

  const hostDefaults = getHostDefaults();
  const clangArgs = buildClangArgs(irPath, execPath, options, hostDefaults);

  if (options.verbose) {
    log.info("---------------------------------------------");
    log.info("Compiling LLVM IR to executable with clang...");
    log.info("---------------------------------------------");
    log.debug(`clang ${clangArgs.join(" ")}`);
  }

  const compileResult = spawnSync("clang", clangArgs, {
    stdio: options.verbose ? "inherit" : "pipe",
  });

  if (compileResult.status !== 0) {
    const stderr = compileResult.stderr?.toString() ?? "";
    return {
      success: false,
      error: `Failed to compile LLVM IR with clang${stderr ? `\n${stderr}` : ""}`,
    };
  }

  if (options.verbose) {
    log.info(`Executable created: ${execPath}`);
  }

  return {
    success: true,
    executablePath: execPath,
  };
}

/**
 * Run a compiled executable
 */
export function runExecutable(
  execPath: string,
  programArgs: string[] = [],
  verbose: boolean = false,
): RunResult {
  if (verbose) {
    log.info("---------------------------------------------");
    log.info(`Running executable: ${execPath}`);
    log.info("---------------------------------------------");
  }

  const runResult = spawnSync(execPath, programArgs, {
    stdio: "inherit",
  });

  const exitCode = runResult.status ?? 1;

  if (verbose) {
    log.info("---------------------------------------------");
    if (exitCode !== 0) {
      log.error(`Program exited with code ${exitCode}`);
    }
  }

  return {
    success: exitCode === 0,
    exitCode,
  };
}

/**
 * Compile and optionally run in one step
 */
export function compileBinaryAndRun(
  irPath: string,
  options: CompileOptions,
  programArgs?: string[],
): void {
  const compileResult = compileToBinary(irPath, options);

  if (!compileResult.success) {
    log.error(compileResult.error || "Compilation failed");
    process.exit(1);
  }

  if (options.run && compileResult.executablePath) {
    const runResult = runExecutable(
      compileResult.executablePath,
      programArgs,
      options.verbose,
    );

    if (!runResult.success) {
      process.exit(runResult.exitCode);
    }
  }
}

/**
 * Build clang command line arguments
 */
function buildClangArgs(
  irPath: string,
  execPath: string,
  options: CompileOptions,
  hostDefaults: { target: string },
): string[] {
  const args: string[] = ["-Wno-override-module"];

  // Debug info
  if (options.dwarf) {
    args.push("-g");
  }

  // Optimization level
  if (options.O) {
    args.push(`-O${options.O}`);
  }

  // Target triple
  const target = options.target ?? hostDefaults.target;
  if (target) {
    args.push("-target", target);
  }

  // Sysroot for cross-compilation
  if (options.sysroot) {
    args.push("--sysroot", options.sysroot);
  }

  // CPU options
  if (options.cpu) {
    args.push(`-mcpu=${options.cpu}`);
  }

  if (options.march) {
    args.push(`-march=${options.march}`);
  }

  // Library paths
  for (const p of normalizeArrayOption(options.libPath)) {
    args.push(`-L${p}`);
  }

  // Libraries to link
  for (const l of normalizeArrayOption(options.lib)) {
    args.push(`-l${l}`);
  }

  // Always link libm and libdl (for stack traces)
  args.push("-lm");
  args.push("-ldl");

  // Export symbols for dladdr
  args.push("-rdynamic");

  // Additional clang flags
  for (const flag of normalizeArrayOption(options.clangFlag)) {
    args.push(flag);
  }

  // Explicitly link object files provided in options
  if (options.object) {
    const objs = normalizeArrayOption(options.object);
    objs.forEach((obj) => args.push(obj));
  }

  // Link runtime logic unless skipped
  if (!options.skipRuntime) {
    const bplHome = getBplHome();

    // Link LLVM IR declarations (core exception handling)
    const runtimeLLPath = path.join(bplHome, "lib", "runtime.ll");
    if (fs.existsSync(runtimeLLPath)) {
      // Avoid duplicate linking if it was already added to 'object' in CompilationRunner
      const alreadyLinked =
        (options.object &&
          normalizeArrayOption(options.object).includes(runtimeLLPath)) ||
        args.includes(runtimeLLPath);

      if (!alreadyLinked) {
        args.push(runtimeLLPath);
      }
    }

    // Link C runtime support (signal handlers, stack traces)
    const runtimeSupportPath = path.join(bplHome, "lib", "runtime_support.o");
    if (fs.existsSync(runtimeSupportPath)) {
      const alreadyLinkedSupport =
        (options.object &&
          normalizeArrayOption(options.object).includes(runtimeSupportPath)) ||
        args.includes(runtimeSupportPath);

      if (!alreadyLinkedSupport) {
        args.push(runtimeSupportPath);
      }
    }
  }

  // Input and output
  args.push(irPath, "-o", execPath);

  return args;
}
