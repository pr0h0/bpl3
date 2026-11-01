/**
 * CLI Types and Interfaces
 * Shared types for CLI command handlers
 */

/**
 * Options passed from CLI to compilation commands
 */
export interface CompileOptions {
  project?: boolean;
  /** For `check -`: the path stdin is checked as. */
  stdinFilepath?: string;
  output?: string;
  shared?: boolean;
  header?: string;
  emit?: "llvm" | "ast" | "tokens" | "formatted";
  /**
   * True when `emit` is the root command's default `llvm` rather than an
   * explicit `--emit llvm`. Such builds tree-shake like `bpl build`.
   */
  emitDefaulted?: boolean;
  target?: string;
  sysroot?: string;
  cpu?: string;
  march?: string;
  lib?: string | string[];
  libPath?: string | string[];
  object?: string | string[];
  clangFlag?: string | string[];
  wasmRuntime?: "freestanding" | "host";
  debugIrPath?: string;
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
  stdinFilepath?: string;
  config?: string | boolean;
  indentWidth?: string;
  useTabs?: boolean;
  lineEnding?: string;
  write?: boolean;
  check?: boolean;
  verbose?: boolean;
  json?: boolean;
}

/**
 * Options for lint command
 */
export interface LintOptions {
  stdinFilepath?: string;
  /** Lint codes to skip; each entry may hold several, comma-separated. */
  disable?: string[];
  failOnWarnings?: boolean;
  verbose?: boolean;
  json?: boolean;
}

/**
 * Options for package manager commands
 */
export type PackageOptionsOutput = { output?: string; json?: boolean };
export type PackageOptionsGlobal = {
  global: boolean;
  tree?: boolean;
  json?: boolean;
};
export type PackageOptionsVerbose = PackageOptionsGlobal & {
  verbose: boolean;
  locked?: boolean;
  update?: boolean;
  repairLock?: boolean;
};
export type PackageOptions =
  PackageOptionsOutput | PackageOptionsGlobal | PackageOptionsVerbose;

/**
 * Host platform defaults for compilation
 */
export interface HostDefaults {
  os: string;
  arch: string;
  target: string;
}
