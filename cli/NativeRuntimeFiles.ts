import { spawnSync } from "child_process";
import { createHash } from "crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
} from "fs";
import { tmpdir } from "os";
import { basename, dirname, join } from "path";

import {
  getCompilerDriver,
  getCompilerDriverTimeoutMs,
} from "../compiler/common/CompilerDriver";
import { Logger } from "../compiler/common/Logger";
import { getNativeCodegenFlags } from "../compiler/common/NativeLinkerFlags";
import { getBplHome } from "../compiler/common/PathResolver";
import { findSymlinkedParentPath } from "../compiler/common/PathSafety";
import { formatCommandSpawnFailure } from "../compiler/common/ProcessErrors";
import type { CompileOptions } from "./types";
import { normalizeArrayOption } from "./utils";

const log = new Logger("NativeRuntimeFiles");

type RuntimeObjectCacheEntry = string | undefined;

const runtimeObjectCache = new Map<string, RuntimeObjectCacheEntry>();
const BPL_NATIVE_RUNTIME_SYMBOL_PATTERN =
  /@(?:__bpl_[A-Za-z0-9_]+|defer_top|exception_top|exception_value|exception_type)\b/;

export interface NativeRuntimeFileOptions {
  irPath?: string;
  bplHome?: string;
  cacheDir?: string;
  compiler?: string;
  target?: string;
  compileOptions?: CompileOptions;
  warn?: (message: string) => void;
}

export function resolveNativeRuntimeFiles(
  options: NativeRuntimeFileOptions = {},
): string[] {
  if (
    options.irPath !== undefined &&
    !nativeIrNeedsBplRuntime(options.irPath)
  ) {
    return [];
  }

  const bplHome = options.bplHome ?? getBplHome();
  const runtimeFiles: string[] = [];

  const runtimeLLPath = join(bplHome, "lib", "runtime.ll");
  assertReadableRuntimeInput(runtimeLLPath, "Runtime IR");
  const runtimeObjectPath = getCachedNativeRuntimeObject(runtimeLLPath, options);
  runtimeFiles.push(runtimeObjectPath ?? runtimeLLPath);

  const runtimeSupportPath = join(bplHome, "lib", "runtime_support.o");
  assertReadableRuntimeInput(runtimeSupportPath, "Runtime support object");
  runtimeFiles.push(runtimeSupportPath);

  return runtimeFiles;
}

export function nativeIrNeedsBplRuntime(irPath: string): boolean {
  return BPL_NATIVE_RUNTIME_SYMBOL_PATTERN.test(readFileSync(irPath, "utf8"));
}

export function resetNativeRuntimeFileCacheForTests(): void {
  runtimeObjectCache.clear();
}

function getCachedNativeRuntimeObject(
  runtimeLLPath: string,
  options: NativeRuntimeFileOptions,
): string | undefined {
  const target = options.target;
  const compiler = options.compiler ?? getCompilerDriver(target);
  const cacheDir =
    options.cacheDir ??
    process.env.BPL_NATIVE_RUNTIME_CACHE_DIR ??
    join(tmpdir(), "bpl-native-runtime-cache");
  const compileOptions = options.compileOptions ?? {};
  const { key, objectPath } = runtimeObjectCacheKey(
    runtimeLLPath,
    cacheDir,
    compiler,
    target,
    compileOptions,
  );

  if (runtimeObjectCache.has(key)) {
    return runtimeObjectCache.get(key);
  }

  const object = compileRuntimeObject(
    runtimeLLPath,
    objectPath,
    compiler,
    target,
    compileOptions,
    options.warn,
  );
  runtimeObjectCache.set(key, object);
  return object;
}

function runtimeObjectCacheKey(
  runtimeLLPath: string,
  cacheDir: string,
  compiler: string,
  target: string | undefined,
  options: CompileOptions,
): { key: string; objectPath: string } {
  const stats = statSync(runtimeLLPath);
  const runtimeFingerprint = `${stats.size}-${Math.floor(stats.mtimeMs)}`;
  const compileFingerprint = [
    compiler,
    target ?? "",
    options.sysroot ?? "",
    options.cpu ?? "",
    options.march ?? "",
    options.O ?? "",
    ...getNativeCodegenFlags(),
    ...normalizeArrayOption(options.clangFlag),
  ].join("\0");
  const hash = createHash("sha256")
    .update(compileFingerprint)
    .digest("hex")
    .slice(0, 16);
  const objectName = `${basename(
    runtimeLLPath,
    ".ll",
  )}-${runtimeFingerprint}-${hash}.o`;
  const objectPath = join(cacheDir, objectName);

  return {
    key: [runtimeLLPath, objectPath, compileFingerprint].join("\0"),
    objectPath,
  };
}

function compileRuntimeObject(
  runtimeLLPath: string,
  objectPath: string,
  compiler: string,
  target: string | undefined,
  options: CompileOptions,
  warn: ((message: string) => void) | undefined,
): string | undefined {
  if (existsSync(objectPath)) {
    assertReadableRuntimeInput(objectPath, "Cached runtime object");
    return objectPath;
  }

  mkdirSync(dirname(objectPath), { recursive: true });
  const tempObjectPath = `${objectPath}.${process.pid}.${Date.now()}.tmp`;
  const args = buildRuntimeObjectCompileArgs(
    runtimeLLPath,
    tempObjectPath,
    target,
    options,
  );
  const result = spawnSync(compiler, args, {
    stdio: "pipe",
    timeout: getCompilerDriverTimeoutMs(),
  });

  if (result.status !== 0 || result.error) {
    removeBestEffort(tempObjectPath);
    const message = formatRuntimeObjectCompileFailure(
      compiler,
      result.stderr?.toString(),
      result.error,
    );
    const fullMessage = `Falling back to runtime.ll because cached runtime object compilation failed: ${message}`;
    if (warn) {
      warn(fullMessage);
    } else {
      log.warn(fullMessage);
    }
    return undefined;
  }

  try {
    renameSync(tempObjectPath, objectPath);
  } catch (error) {
    removeBestEffort(tempObjectPath);
    const message = error instanceof Error ? error.message : String(error);
    const fullMessage = `Falling back to runtime.ll because cached runtime object finalization failed: ${message}`;
    if (warn) {
      warn(fullMessage);
    } else {
      log.warn(fullMessage);
    }
    return undefined;
  }

  return objectPath;
}

function buildRuntimeObjectCompileArgs(
  runtimeLLPath: string,
  outputPath: string,
  target: string | undefined,
  options: CompileOptions,
): string[] {
  const args = ["-c", runtimeLLPath, "-Wno-override-module"];

  if (options.O) {
    args.push(`-O${options.O}`);
  }
  if (target) {
    args.push("-target", target);
  }
  if (options.sysroot) {
    args.push("--sysroot", options.sysroot);
  }
  if (options.cpu) {
    args.push(`-mcpu=${options.cpu}`);
  }
  if (options.march) {
    args.push(`-march=${options.march}`);
  }
  args.push(...getNativeCodegenFlags());
  for (const flag of normalizeArrayOption(options.clangFlag)) {
    args.push(flag);
  }

  args.push("-o", outputPath);
  return args;
}

function formatRuntimeObjectCompileFailure(
  command: string,
  stderr: string | undefined,
  error: Error | undefined,
): string {
  if (stderr?.trim()) {
    return stderr.trim();
  }

  return (
    formatCommandSpawnFailure(command, error) ??
    error?.message ??
    "compiler driver failed"
  );
}

function assertReadableRuntimeInput(filePath: string, label: string): void {
  let linkStats;
  try {
    linkStats = lstatSync(filePath, { throwIfNoEntry: false });
  } catch {
    linkStats = undefined;
  }

  if (!linkStats) {
    throw new Error(
      `${label} not found: ${filePath}. Run 'bun run build:runtime' or 'bpl doctor'.`,
    );
  }

  if (linkStats.isSymbolicLink() && !existsSync(filePath)) {
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

  if (!linkStats.isFile()) {
    const stats = statSync(filePath);
    if (stats.isFile()) {
      return;
    }
    throw new Error(
      `${label} is not a file: ${filePath}. Run 'bun run build:runtime' or 'bpl doctor'.`,
    );
  }
}

function removeBestEffort(filePath: string): void {
  try {
    unlinkSync(filePath);
  } catch {
    // Best-effort cleanup after compiler failure.
  }
}
