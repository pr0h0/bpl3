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
}

export function assertWritableInputFilePath(inputPath: string): void {
  const existingInput = tryLstat(inputPath);
  if (!existingInput) {
    throw new Error(`File not found: ${inputPath}`);
  }
  if (existingInput.isSymbolicLink()) {
    throw new Error(`Input path is a symbolic link: ${inputPath}`);
  }
  if (!existingInput.isFile()) {
    throw new Error(`Input path is not a file: ${inputPath}`);
  }
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
