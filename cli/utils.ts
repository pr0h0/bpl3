/**
 * CLI Utility Functions
 * Shared utilities for CLI commands
 */

import * as os from "os";
import type { HostDefaults } from "./types";

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
