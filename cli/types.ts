/**
 * CLI Types and Interfaces
 * Shared types for CLI command handlers
 */

/**
 * Options passed from CLI to compilation commands
 */
export interface CompileOptions {
  output?: string;
  emit?: "llvm" | "ast" | "tokens" | "formatted";
  target?: string;
  sysroot?: string;
  cpu?: string;
  march?: string;
  lib?: string | string[];
  libPath?: string | string[];
  object?: string | string[];
  clangFlag?: string | string[];
  wasmRuntime?: "freestanding" | "host";
  run?: boolean;
  verbose?: boolean;
  cache?: boolean;
  cacheStats?: boolean;
  jobs?: string | number;
  write?: boolean;
  prelude?: boolean;
  dwarf?: boolean;
  stdin?: boolean;
  eval?: string;
  watch?: boolean;
  // New flags
  quiet?: boolean;
  json?: boolean;
  color?: boolean;
  time?: boolean;
  debug?: boolean; // Alias for dwarf
  clear?: boolean; // Clear screen on watch mode recompile
  noRun?: boolean; // Compile only in watch mode, don't execute
  O?: string; // Optimization level: "0", "1", "2", "3"
  skipRuntime?: boolean; // Don't emit runtime definitions (use separate runtime library)
}

/**
 * Options for format command
 */
export interface FormatOptions {
  write?: boolean;
  check?: boolean;
  verbose?: boolean;
}

/**
 * Options for lint command
 */
export interface LintOptions {
  verbose?: boolean;
  json?: boolean;
}

/**
 * Options for package manager commands
 */
export type PackageOptionsOutput = { output: string };
export type PackageOptionsGlobal = { global: boolean };
export type PackageOptionsVerbose = PackageOptionsGlobal & {
  verbose: boolean;
  locked?: boolean;
};
export type PackageOptions =
  | PackageOptionsOutput
  | PackageOptionsGlobal
  | PackageOptionsVerbose;

/**
 * Host platform defaults for compilation
 */
export interface HostDefaults {
  os: string;
  arch: string;
  target: string;
}
