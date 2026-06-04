/**
 * Binary Runner
 * Handles compilation of LLVM IR to executable and execution
 */

import { spawnSync } from "child_process";
import * as path from "path";
import * as fs from "fs";
import type { CompileOptions, HostDefaults } from "./types";
import {
  assertWritableFileOutputPath,
  getHostDefaults,
  getNativeLinkerFlags,
  normalizeArrayOption,
} from "./utils";
import {
  getCompilerDriver,
  getCompilerDriverTimeoutMs,
  isWasmTarget as isCompilerDriverWasmTarget,
} from "../compiler/common/CompilerDriver";
import { getOptionalPositiveIntegerEnv } from "../compiler/common/Env";
import { Logger } from "../compiler/common/Logger";
import { getBplHome } from "../compiler/common/PathResolver";
import { findSymlinkedParentPath } from "../compiler/common/PathSafety";
import { hasHostedWasmRuntimeComponent } from "../compiler/common/TargetTriple";
import {
  formatCommandSpawnFailure,
  getProcessErrorCode,
} from "../compiler/common/ProcessErrors";
import {
  findWasmLinker,
  formatRequiredWasmLinkerError,
  getWasmLinkerCandidates,
  getWasmLinkerProbeTimeoutMs,
} from "./WasmToolchain";
import { resolveNativeRuntimeFiles } from "./NativeRuntimeFiles";

const log = new Logger("BinaryRunner");

export function isWasmTarget(target?: string): boolean {
  return isCompilerDriverWasmTarget(target);
}

export function getWasmRuntimeMode(
  options: CompileOptions,
  target?: string,
): "freestanding" | "host" {
  if (
    options.wasmRuntime &&
    options.wasmRuntime !== "host" &&
    options.wasmRuntime !== "freestanding"
  ) {
    throw new Error(
      `Unsupported wasm runtime mode "${options.wasmRuntime}". Use "freestanding" or "host".`,
    );
  }

  if (options.wasmRuntime === "host") {
    return "host";
  }
  if (options.wasmRuntime === "freestanding") {
    return "freestanding";
  }

  if (hasHostedWasmRuntimeComponent(target)) {
    return "host";
  }

  return "freestanding";
}

function isEnvFlagEnabled(value: string | undefined): boolean {
  if (!value) return false;
  return !["0", "false", "no", "off"].includes(value.toLowerCase());
}

function isExecutableFile(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return false;
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveExecutablePath(command: string): string | undefined {
  if (path.isAbsolute(command) || command.includes(path.sep)) {
    const resolved = path.resolve(command);
    return isExecutableFile(resolved) ? resolved : undefined;
  }

  const pathEnv = process.env.PATH;
  if (!pathEnv) return undefined;

  for (const entry of pathEnv.split(path.delimiter)) {
    if (!entry) continue;
    const candidate = path.join(entry, command);
    if (isExecutableFile(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function getWasmClangFuseLdArg(wasmLinker: string | undefined): string | undefined {
  if (!wasmLinker) return undefined;
  if (wasmLinker === "ld.lld") return "-fuse-ld=lld";

  const resolvedLinker = resolveExecutablePath(wasmLinker);
  if (resolvedLinker) return `-fuse-ld=${resolvedLinker}`;

  return "-fuse-ld=lld";
}

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
  error?: string;
}

export interface CompileBinaryAndRunResult {
  compile: CompileResult;
  run?: RunResult;
}

/**
 * Compile LLVM IR to a native executable using an LLVM-capable compiler driver.
 */
export function compileToBinary(
  irPath: string,
  options: CompileOptions,
): CompileResult {
  const execPath = getExecutableOutputPath(irPath, options);
  let tempExecPath: string;
  let clangArgs: string[];
  try {
    assertReadableCompileInput(irPath, "LLVM IR input");
    assertWritableFileOutputPath(execPath);
    for (const objectPath of normalizeArrayOption(options.object)) {
      assertReadableCompileInput(objectPath, "Link object input");
    }
    if (options.sysroot) {
      assertReadableDirectoryInput(options.sysroot, "Sysroot input");
    }
    for (const libPath of normalizeArrayOption(options.libPath)) {
      assertReadableDirectoryInput(libPath, "Library search path input");
    }
    const hostDefaults = getHostDefaults();
    const target = options.target ?? hostDefaults.target;
    tempExecPath = createTemporaryOutputPath(execPath);
    clangArgs = buildClangArgs(irPath, tempExecPath, options, hostDefaults);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const hostDefaults = getHostDefaults();
  const target = options.target ?? hostDefaults.target;
  const clangCommand = getCompilerDriver(target);

  if (options.verbose) {
    log.info("---------------------------------------------");
    log.info("Compiling LLVM IR to executable with compiler driver...");
    log.info("---------------------------------------------");
    log.debug(`${clangCommand} ${clangArgs.join(" ")}`);
  }

  const compileResult = spawnSync(clangCommand, clangArgs, {
    stdio: options.verbose ? "inherit" : "pipe",
    timeout: getCompilerDriverTimeoutMs(),
  });

  if (compileResult.status !== 0) {
    const stderr = compileResult.stderr?.toString() ?? "";
    const spawnError = compileResult.error
      ? formatCompileSpawnError(compileResult.error, clangCommand)
      : "";
    removeBestEffort(tempExecPath);
    return {
      success: false,
      error: `Failed to compile LLVM IR with ${clangCommand}${stderr || spawnError ? `\n${stderr || spawnError}` : ""}`,
    };
  }

  const tempExecStats = tryLstat(tempExecPath);
  if (!tempExecStats?.isFile()) {
    removeBestEffort(tempExecPath);
    return {
      success: false,
      error: `Compiler driver did not create executable output: ${execPath}`,
    };
  }

  try {
    const existingExecStats = tryLstat(execPath);
    if (existingExecStats?.isFile()) {
      fs.chmodSync(tempExecPath, existingExecStats.mode & 0o777);
    }
    fs.renameSync(tempExecPath, execPath);
  } catch (error) {
    removeBestEffort(tempExecPath);
    return {
      success: false,
      error: `Failed to finalize executable output ${execPath}: ${error instanceof Error ? error.message : String(error)}`,
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

export function getExecutableOutputPath(
  irPath: string,
  options: CompileOptions,
): string {
  const hostDefaults = getHostDefaults();
  const target = options.target ?? hostDefaults.target;
  const execPathBase = isWasmTarget(target)
    ? irPath.endsWith(".wasm.ll")
      ? irPath.replace(/\.ll$/, "")
      : irPath.replace(/\.ll$/, ".wasm")
    : irPath.replace(/\.ll$/, "");

  return path.isAbsolute(execPathBase)
    ? execPathBase
    : path.resolve(execPathBase);
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
    ...getRunTimeoutOption(),
  });

  if (runResult.error) {
    const error = formatRunSpawnError(runResult.error, execPath);
    return {
      success: false,
      exitCode: 1,
      error,
    };
  }

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
): CompileBinaryAndRunResult {
  const compileResult = compileToBinary(irPath, options);

  if (!compileResult.success) {
    if (options.json) {
      throw new Error(compileResult.error || "Compilation failed");
    }
    log.error(compileResult.error || "Compilation failed");
    process.exit(1);
  }

  let runResult: RunResult | undefined;
  if (options.run && compileResult.executablePath) {
    runResult = runExecutable(
      compileResult.executablePath,
      programArgs,
      options.verbose,
    );

    if (!runResult.success) {
      if (options.json && runResult.error) {
        throw new Error(runResult.error);
      }
      if (runResult.error) {
        log.error(runResult.error);
      }
      process.exit(runResult.exitCode);
    }
  }

  return {
    compile: compileResult,
    run: runResult,
  };
}

/**
 * Build clang command line arguments
 */
function buildClangArgs(
  irPath: string,
  execPath: string,
  options: CompileOptions,
  hostDefaults: HostDefaults,
): string[] {
  const args: string[] = ["-Wno-override-module"];
  const target = options.target ?? hostDefaults.target;
  const wasmTarget = isWasmTarget(target);
  const wasmRuntimeMode = getWasmRuntimeMode(options, target);
  const wasmLinkerCandidates = getWasmLinkerCandidates();
  const wasmLinkerProbeTimeoutMs = getWasmLinkerProbeTimeoutMs(
    process.env,
    (message) => log.warn(message),
  );
  const wasmLinker = wasmTarget
    ? findWasmLinker(wasmLinkerCandidates, wasmLinkerProbeTimeoutMs)
    : undefined;
  const linkWasm = Boolean(wasmLinker);

  if (
    wasmTarget &&
    !wasmLinker &&
    isEnvFlagEnabled(process.env.BPL_REQUIRE_WASM_LD)
  ) {
    throw new Error(formatRequiredWasmLinkerError(wasmLinkerCandidates));
  }

  // Debug info
  if (options.dwarf) {
    args.push("-g");
  }

  // Optimization level
  if (options.O) {
    args.push(`-O${options.O}`);
  }

  // Target triple
  if (target) {
    args.push("-target", target);
  }

  const wasmFuseLdArg = getWasmClangFuseLdArg(wasmLinker);
  if (wasmFuseLdArg) {
    args.push(wasmFuseLdArg);
  }

  if (wasmTarget) {
    if (linkWasm) {
      args.push(
        "-nostdlib",
        "-Wl,--no-entry",
        "-Wl,--export-all",
        "-Wl,--export-memory",
      );
      if (wasmRuntimeMode === "host") {
        args.push("-Wl,--allow-undefined");
      }
    } else {
      args.push("-c");
    }
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

  if (!wasmTarget) {
    args.push(...getNativeLinkerFlags(hostDefaults.os));
  }

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
  if (!options.skipRuntime && !wasmTarget) {
    for (const runtimeFile of resolveNativeRuntimeFiles({
      target,
      compileOptions: options,
      warn: (message) => log.warn(message),
    })) {
      const alreadyLinkedSupport =
        (options.object &&
          normalizeArrayOption(options.object).includes(runtimeFile)) ||
        args.includes(runtimeFile);

      if (!alreadyLinkedSupport) {
        args.push(runtimeFile);
      }
    }
  }

  if (!options.skipRuntime && wasmTarget) {
    const runtimeWasmPath = path.join(getBplHome(), "lib", "runtime_wasm.ll");
    assertReadableRuntimeInput(runtimeWasmPath, "WebAssembly runtime IR");
    const alreadyLinked =
      (options.object &&
        normalizeArrayOption(options.object).includes(runtimeWasmPath)) ||
      args.includes(runtimeWasmPath);

    if (linkWasm && !alreadyLinked) {
      args.push(runtimeWasmPath);
    }

    if (wasmRuntimeMode === "host") {
      const runtimeWasmHostPath = path.join(
        getBplHome(),
        "lib",
        "runtime_wasm_host.ll",
      );
      assertReadableRuntimeInput(
        runtimeWasmHostPath,
        "Hosted WebAssembly runtime IR",
      );
      const alreadyLinked =
        (options.object &&
          normalizeArrayOption(options.object).includes(runtimeWasmHostPath)) ||
        args.includes(runtimeWasmHostPath);

      if (linkWasm && !alreadyLinked) {
        args.push(runtimeWasmHostPath);
      }
    }
  }

  // Input and output
  args.push(irPath, "-o", execPath);

  return args;
}

function assertReadableRuntimeInput(filePath: string, label: string): void {
  const linkStats = tryLstat(filePath);
  if (!linkStats) {
    throw new Error(
      `${label} not found: ${filePath}. Run 'bun run build:runtime' or 'bpl doctor'.`,
    );
  }

  if (linkStats.isSymbolicLink() && !fs.existsSync(filePath)) {
    throw new Error(
      `${label} is a broken symbolic link: ${filePath}. Run 'bun run build:runtime' or 'bpl doctor'.`,
    );
  }

  const symlinkedParent = findSymlinkedParentPath(filePath);
  if (symlinkedParent) {
    throw new Error(
      `${label} parent path contains a symbolic link: ${symlinkedParent}. Run 'bun run build:runtime' or 'bpl doctor'.`,
    );
  }

  if (!fs.statSync(filePath).isFile()) {
    throw new Error(
      `${label} is not a file: ${filePath}. Run 'bun run build:runtime' or 'bpl doctor'.`,
    );
  }
}

function assertReadableCompileInput(filePath: string, label: string): void {
  const linkStats = tryLstat(filePath);
  if (!linkStats) {
    throw new Error(`${label} not found: ${filePath}.`);
  }

  if (linkStats.isSymbolicLink() && !fs.existsSync(filePath)) {
    throw new Error(`${label} is a broken symbolic link: ${filePath}.`);
  }

  if (!fs.statSync(filePath).isFile()) {
    throw new Error(`${label} is not a file: ${filePath}.`);
  }
}

function assertReadableDirectoryInput(filePath: string, label: string): void {
  const linkStats = tryLstat(filePath);
  if (!linkStats) {
    throw new Error(`${label} not found: ${filePath}.`);
  }

  if (linkStats.isSymbolicLink() && !fs.existsSync(filePath)) {
    throw new Error(`${label} is a broken symbolic link: ${filePath}.`);
  }

  if (!fs.statSync(filePath).isDirectory()) {
    throw new Error(`${label} is not a directory: ${filePath}.`);
  }
}

function createTemporaryOutputPath(outputPath: string): string {
  for (let attempt = 0; attempt < 10; attempt++) {
    const tempPath = path.join(
      path.dirname(path.resolve(outputPath)),
      `.${path.basename(outputPath)}.${process.pid}-${Date.now()}-${Math.random()
        .toString(16)
        .slice(2)}-${attempt}.tmp`,
    );
    if (tryLstat(tempPath)) {
      continue;
    }
    assertWritableFileOutputPath(tempPath);
    return tempPath;
  }

  throw new Error(
    `Failed to create temporary executable output for ${outputPath}`,
  );
}

function removeBestEffort(filePath: string): void {
  try {
    fs.rmSync(filePath, { force: true, recursive: true });
  } catch {
    // Best-effort cleanup only.
  }
}

function formatRunSpawnError(error: Error, execPath: string): string {
  const code = getProcessErrorCode(error);
  if (code === "ENOENT") {
    return `Executable not found: ${execPath}`;
  }
  if (code === "EACCES") {
    return `Executable is not runnable: ${execPath} (permission denied)`;
  }
  if (code === "ENOEXEC") {
    return `Executable format is not runnable on this host: ${execPath}`;
  }
  if (code === "ETIMEDOUT") {
    return `Executable timed out: ${execPath}`;
  }

  return `Failed to run executable ${execPath}: ${error.message}`;
}

function getRunTimeoutOption(): { timeout?: number } {
  const timeout = getOptionalPositiveIntegerEnv("BPL_RUN_TIMEOUT_MS", {
    warn: (message) => log.warn(message),
    fallbackAction: "running without timeout",
  });

  return timeout === undefined ? {} : { timeout };
}

function formatCompileSpawnError(error: Error, command: string): string {
  return formatCommandSpawnFailure(command, error) ?? `${command}: ${error.message}`;
}

function tryLstat(filePath: string): fs.Stats | null {
  try {
    return fs.lstatSync(filePath);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error.code === "ENOENT" || error.code === "ENOTDIR")
    ) {
      return null;
    }

    throw error;
  }
}
