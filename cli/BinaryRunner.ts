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
import { Logger } from "../compiler/common/Logger";
import { getBplHome } from "../compiler/common/PathResolver";
import {
  formatCommandSpawnFailure,
  getProcessErrorCode,
} from "../compiler/common/ProcessErrors";

const log = new Logger("BinaryRunner");
const WASM_LINKER_PROBE_TIMEOUT_MS = 5000;

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

  const normalizedTarget = target?.toLowerCase() ?? "";
  if (
    normalizedTarget.includes("wasi") ||
    normalizedTarget.includes("emscripten")
  ) {
    return "host";
  }

  return "freestanding";
}

function findWasmLinker(): string | undefined {
  const candidates = [
    process.env.WASM_LD,
    "wasm-ld",
    "wasm-ld-18",
    "wasm-ld-17",
    "wasm-ld-16",
    "ld.lld",
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates.find((candidate) => {
    const result = spawnSync(candidate, ["--version"], {
      stdio: "ignore",
      timeout: getWasmLinkerProbeTimeoutMs(),
    });
    return result.status === 0;
  });
}

function isEnvFlagEnabled(value: string | undefined): boolean {
  if (!value) return false;
  return !["0", "false", "no", "off"].includes(value.toLowerCase());
}

function getWasmLinkerProbeTimeoutMs(): number {
  const raw = process.env.BPL_WASM_LINKER_PROBE_TIMEOUT_MS;
  if (!raw) return WASM_LINKER_PROBE_TIMEOUT_MS;

  const parsed = Number(raw);
  if (Number.isSafeInteger(parsed) && parsed > 0) {
    return parsed;
  }

  log.warn(
    `Ignoring invalid BPL_WASM_LINKER_PROBE_TIMEOUT_MS=${raw}; using ${WASM_LINKER_PROBE_TIMEOUT_MS}ms`,
  );
  return WASM_LINKER_PROBE_TIMEOUT_MS;
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
      if (runResult.error) {
        log.error(runResult.error);
      }
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
  hostDefaults: HostDefaults,
): string[] {
  const args: string[] = ["-Wno-override-module"];
  const target = options.target ?? hostDefaults.target;
  const wasmTarget = isWasmTarget(target);
  const wasmRuntimeMode = getWasmRuntimeMode(options, target);
  const wasmLinker = wasmTarget ? findWasmLinker() : undefined;
  const linkWasm = Boolean(wasmLinker);

  if (
    wasmTarget &&
    !wasmLinker &&
    isEnvFlagEnabled(process.env.BPL_REQUIRE_WASM_LD)
  ) {
    throw new Error(
      "BPL_REQUIRE_WASM_LD=1 requires a wasm linker. Install LLVM lld or set WASM_LD to a working wasm-ld binary.",
    );
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

  if (wasmLinker === "ld.lld") {
    args.push("-fuse-ld=lld");
  } else if (wasmLinker && wasmLinker === process.env.WASM_LD) {
    args.push(`-fuse-ld=${wasmLinker}`);
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
    const bplHome = getBplHome();

    // Link LLVM IR declarations (core exception handling)
    const runtimeLLPath = path.join(bplHome, "lib", "runtime.ll");
    if (tryLstat(runtimeLLPath)) {
      assertReadableRuntimeInput(runtimeLLPath, "Runtime IR");
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
    if (tryLstat(runtimeSupportPath)) {
      assertReadableRuntimeInput(runtimeSupportPath, "Runtime support object");
      const alreadyLinkedSupport =
        (options.object &&
          normalizeArrayOption(options.object).includes(runtimeSupportPath)) ||
        args.includes(runtimeSupportPath);

      if (!alreadyLinkedSupport) {
        args.push(runtimeSupportPath);
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

  return `Failed to run executable ${execPath}: ${error.message}`;
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
