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
  run?: boolean;
  verbose?: boolean;
  cache?: boolean;
  write?: boolean;
  prelude?: boolean;
  dwarf?: boolean;
  stdin?: boolean;
}

/**
 * Options for format command
 */
export interface FormatOptions {
  write?: boolean;
  verbose?: boolean;
}

/**
 * Options for lint command
 */
export interface LintOptions {
  verbose?: boolean;
}

/**
 * Options for package manager commands
 */
export type PackageOptionsOutput = { output: string };
export type PackageOptionsGlobal = { global: boolean };
export type PackageOptionsVerbose = PackageOptionsGlobal & { verbose: boolean };
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
