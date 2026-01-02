/**
 * Centralized Compiler Configuration
 *
 * Provides a unified configuration interface for the BPL compiler,
 * consolidating environment variables, defaults, and runtime settings.
 */

import { existsSync } from "fs";
import { resolve } from "path";
import { getBplHome, getLibPath, getGrammarPath } from "./PathResolver";

/**
 * Optimization levels for code generation
 */
export type OptLevel = "0" | "1" | "2" | "3" | "s" | "z";

/**
 * Compiler output format
 */
export type EmitType = "llvm" | "ast" | "tokens" | "formatted" | "binary";

/**
 * Target triple for cross-compilation
 */
export interface TargetTriple {
  arch: string;
  vendor: string;
  os: string;
  env?: string;
}

/**
 * Path configuration
 */
export interface PathConfig {
  /** BPL installation root */
  bplHome: string;
  /** Standard library directory */
  libDir: string;
  /** Grammar directory */
  grammarDir: string;
  /** Cache directory for compiled modules */
  cacheDir: string;
  /** Current working directory */
  cwd: string;
}

/**
 * Default compilation settings
 */
export interface DefaultsConfig {
  /** Default optimization level */
  optimization: OptLevel;
  /** Default target triple (host system) */
  target: string;
  /** Default output format */
  emit: EmitType;
  /** Default output filename */
  outputName: string;
}

/**
 * Feature flags
 */
export interface FeaturesConfig {
  /** Enable module caching */
  enableCache: boolean;
  /** Enable DWARF debug info */
  enableDwarf: boolean;
  /** Enable verbose output */
  verbose: boolean;
  /** Enable color output */
  colorize: boolean;
  /** Enable experimental features */
  experimental: boolean;
}

/**
 * Complete compiler configuration
 */
export interface CompilerConfig {
  paths: PathConfig;
  defaults: DefaultsConfig;
  features: FeaturesConfig;
}

/**
 * Environment variable names used by the compiler
 */
export const ENV_VARS = {
  BPL_HOME: "BPL_HOME",
  BPL_CACHE_DIR: "BPL_CACHE_DIR",
  BPL_VERBOSE: "BPL_VERBOSE",
  BPL_DEBUG: "BPL_DEBUG",
  NO_COLOR: "NO_COLOR",
} as const;

/**
 * Get the default target triple for the current system
 */
function getDefaultTarget(): string {
  const platform = process.platform;
  const arch = process.arch;

  const archMap: Record<string, string> = {
    x64: "x86_64",
    arm64: "aarch64",
    arm: "arm",
    ia32: "i386",
  };

  const osMap: Record<string, string> = {
    linux: "unknown-linux-gnu",
    darwin: "apple-darwin",
    win32: "pc-windows-msvc",
    freebsd: "unknown-freebsd",
  };

  const mappedArch = archMap[arch] || arch;
  const mappedOs = osMap[platform] || "unknown";

  return `${mappedArch}-${mappedOs}`;
}

/**
 * Get the cache directory path
 */
function getCacheDir(): string {
  // Check environment variable first
  const envCache = process.env[ENV_VARS.BPL_CACHE_DIR];
  if (envCache && existsSync(envCache)) {
    return envCache;
  }

  // Use XDG cache dir on Linux
  const xdgCache = process.env.XDG_CACHE_HOME;
  if (xdgCache) {
    return resolve(xdgCache, "bpl");
  }

  // Default to ~/.cache/bpl or platform equivalent
  const homeDir = process.env.HOME || process.env.USERPROFILE || "/tmp";
  return resolve(homeDir, ".cache", "bpl");
}

/**
 * Determine if color output should be enabled
 */
function shouldColorize(): boolean {
  // NO_COLOR standard: https://no-color.org/
  if (process.env[ENV_VARS.NO_COLOR] === "1") {
    return false;
  }

  // Check if stdout is a TTY
  if (process.stdout.isTTY === false) {
    return false;
  }

  return true;
}

/**
 * Determine if verbose mode is enabled
 */
function isVerbose(): boolean {
  return (
    process.env[ENV_VARS.BPL_VERBOSE] === "1" ||
    process.env[ENV_VARS.BPL_DEBUG] === "1"
  );
}

// Cached configuration instance
let cachedConfig: CompilerConfig | null = null;

/**
 * Get the compiler configuration
 *
 * Configuration is determined from:
 * 1. Environment variables
 * 2. Built-in defaults
 *
 * The configuration is cached after first access.
 *
 * @param force - Force recalculation of configuration (useful for testing)
 */
export function getConfig(force: boolean = false): CompilerConfig {
  if (cachedConfig && !force) {
    return cachedConfig;
  }

  const bplHome = getBplHome();

  cachedConfig = {
    paths: {
      bplHome,
      libDir: getLibPath(),
      grammarDir: getGrammarPath(),
      cacheDir: getCacheDir(),
      cwd: process.cwd(),
    },
    defaults: {
      optimization: "0",
      target: getDefaultTarget(),
      emit: "binary",
      outputName: "a.out",
    },
    features: {
      enableCache: true,
      enableDwarf: false,
      verbose: isVerbose(),
      colorize: shouldColorize(),
      experimental: false,
    },
  };

  return cachedConfig;
}

/**
 * Update runtime configuration
 *
 * This allows CLI options to override defaults.
 * Changes persist for the lifetime of the process.
 */
export function updateConfig(
  updates: Partial<{
    defaults: Partial<DefaultsConfig>;
    features: Partial<FeaturesConfig>;
  }>,
): CompilerConfig {
  const config = getConfig();

  if (updates.defaults) {
    Object.assign(config.defaults, updates.defaults);
  }

  if (updates.features) {
    Object.assign(config.features, updates.features);
  }

  return config;
}

/**
 * Reset configuration cache (useful for testing)
 */
export function resetConfig(): void {
  cachedConfig = null;
}
