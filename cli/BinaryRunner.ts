/**
 * Binary Runner
 * Handles compilation of LLVM IR to executable and execution
 */

import { spawnSync } from "child_process";
import * as path from "path";
import type { CompileOptions } from "./types";
import { getHostDefaults, normalizeArrayOption } from "./utils";

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
    console.log("---------------------------------------------");
    console.log(`Compiling LLVM IR to executable with clang...`);
    console.log("---------------------------------------------");
    console.log(`clang ${clangArgs.join(" ")}`);
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
    console.log(`Executable created: ${execPath}`);
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
    console.log("---------------------------------------------");
    console.log(`Running executable: ${execPath}`);
    console.log("---------------------------------------------");
  }

  const runResult = spawnSync(execPath, programArgs, {
    stdio: "inherit",
  });

  const exitCode = runResult.status ?? 1;

  if (verbose) {
    console.log("---------------------------------------------");
    if (exitCode !== 0) {
      console.error(`Program exited with code ${exitCode}`);
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
    console.error(compileResult.error);
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

  // Input and output
  args.push(irPath, "-o", execPath);

  return args;
}
