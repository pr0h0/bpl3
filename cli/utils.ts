/**
 * CLI Utility Functions
 * Shared utilities for CLI commands
 */

import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import type { HostDefaults } from "./types";
export { getNativeLinkerFlags } from "../compiler/common/NativeLinkerFlags";

/**
 * Get host platform defaults for cross-compilation
 * Detects the current platform and returns appropriate target triple
 */
export function getHostDefaults(): HostDefaults {
  const platform = os.platform();
  const arch = os.arch();

  let targetArch: string;
  switch (arch) {
    case "x64":
      targetArch = "x86_64";
      break;
    case "arm64":
      targetArch = "aarch64";
      break;
    case "arm":
      targetArch = "arm";
      break;
    default:
      targetArch = arch;
  }

  let targetOs: string;
  let targetVendor = "unknown";
  let targetEnv = "gnu";

  switch (platform) {
    case "linux":
      targetOs = "linux";
      targetVendor = "unknown";
      targetEnv = "gnu";
      break;
    case "darwin":
      targetOs = "darwin";
      targetVendor = "apple";
      targetEnv = "";
      break;
    case "win32":
      targetOs = "windows";
      targetVendor = "pc";
      targetEnv = "msvc";
      break;
    default:
      targetOs = platform;
  }

  const target = targetEnv
    ? `${targetArch}-${targetVendor}-${targetOs}-${targetEnv}`
    : `${targetArch}-${targetVendor}-${targetOs}`;

  return {
    os: platform,
    arch,
    target,
  };
}

/**
 * Normalize array option from commander
 * Commander can pass single values or arrays depending on usage
 */
export function normalizeArrayOption(
  option: string | string[] | undefined,
): string[] {
  if (!option) return [];
  return Array.isArray(option) ? option : [option];
}

export function assertWritableFileOutputPath(outputPath: string): void {
  const existingOutput = tryLstat(outputPath);
  if (existingOutput?.isSymbolicLink()) {
    throw new Error(`Output path is a symbolic link: ${outputPath}`);
  }
  if (existingOutput?.isDirectory()) {
    throw new Error(`Output path is a directory: ${outputPath}`);
  }
  if (existingOutput && !existingOutput.isFile()) {
    throw new Error(`Output path is not a regular file: ${outputPath}`);
  }

  const outputDir = path.dirname(path.resolve(outputPath));
  const outputDirStats = tryLstat(outputDir);
  if (!outputDirStats) {
    throw new Error(`Output directory not found: ${outputDir}`);
  }
  if (outputDirStats.isSymbolicLink()) {
    throw new Error(`Output parent path is a symbolic link: ${outputDir}`);
  }
  if (!outputDirStats.isDirectory()) {
    throw new Error(`Output parent path is not a directory: ${outputDir}`);
  }

  assertNoSymlinkedOutputParentPath(outputPath);
}

export function assertWritableInputFilePath(inputPath: string): void {
  const error = getInputFilePathError(inputPath);
  if (error) {
    throw new Error(`${error}: ${inputPath}`);
  }
}

export function getInputFilePathError(inputPath: string): string | null {
  const existingInput = tryLstat(inputPath);
  if (!existingInput) {
    return "File not found";
  }
  if (existingInput.isSymbolicLink()) {
    return "Input path is a symbolic link";
  }
  if (!existingInput.isFile()) {
    return "Input path is not a file";
  }

  return null;
}

export function writeFileAtomically(filePath: string, content: string): void {
  assertWritableFileOutputPath(filePath);
  const existingFile = tryLstat(filePath);
  const mode =
    existingFile && existingFile.isFile() ? existingFile.mode & 0o777 : undefined;

  for (let attempt = 0; attempt < 10; attempt++) {
    const tempPath = getAtomicWriteTempPath(filePath, attempt);
    let createdTemp = false;

    try {
      fs.writeFileSync(tempPath, content, {
        flag: "wx",
        ...(mode === undefined ? {} : { mode }),
      });
      createdTemp = true;
      assertNoSymlinkedOutputParentPath(tempPath);
      if (mode !== undefined) {
        fs.chmodSync(tempPath, mode);
      }
      assertNoSymlinkedOutputParentPath(filePath);
      fs.renameSync(tempPath, filePath);
      return;
    } catch (error) {
      if (isNodeErrorCode(error, "EEXIST")) {
        continue;
      }
      removeBestEffort(tempPath);
      throw error;
    } finally {
      if (createdTemp) {
        removeBestEffort(tempPath);
      }
    }
  }

  throw new Error(`Failed to create temporary output file for ${filePath}`);
}

function getAtomicWriteTempPath(filePath: string, attempt: number): string {
  return path.join(
    path.dirname(path.resolve(filePath)),
    `.${path.basename(filePath)}.${process.pid}-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}-${attempt}.tmp`,
  );
}

function assertNoSymlinkedOutputParentPath(filePath: string): void {
  const symlinkedParent = findSymlinkedPathComponent(
    path.dirname(path.resolve(filePath)),
  );
  if (!symlinkedParent) return;

  throw new Error(
    `Output parent path contains a symbolic link: ${symlinkedParent}`,
  );
}

function findSymlinkedPathComponent(targetPath: string): string | null {
  const absolutePath = path.resolve(targetPath);
  const rootPath = path.parse(absolutePath).root;
  const parts = path
    .relative(rootPath, absolutePath)
    .split(path.sep)
    .filter((part) => part.length > 0);

  let currentPath = rootPath;
  for (const part of parts) {
    currentPath = path.join(currentPath, part);
    const stats = tryLstat(currentPath);
    if (stats?.isSymbolicLink()) return currentPath;
    if (stats && !stats.isDirectory()) return null;
  }

  return null;
}

function removeBestEffort(filePath: string): void {
  try {
    if (
      findSymlinkedPathComponent(path.dirname(path.resolve(filePath))) !== null
    ) {
      return;
    }
    fs.rmSync(filePath, { force: true });
  } catch {
    // Best-effort cleanup only.
  }
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === code
  );
}

function tryLstat(filePath: string): fs.Stats | null {
  try {
    return fs.lstatSync(filePath);
  } catch (error) {
    if (
      isNodeErrorCode(error, "ENOENT") ||
      isNodeErrorCode(error, "ENOTDIR")
    ) {
      return null;
    }

    throw error;
  }
}
