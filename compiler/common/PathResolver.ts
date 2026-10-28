/**
 * Path Resolution Utilities
 *
 * Provides centralized path resolution using BPL_HOME environment variable
 * to ensure the compiler can locate resources (grammar, lib) from anywhere.
 */

import { existsSync, realpathSync } from "fs";
import { dirname, resolve } from "path";
import { findSymlinkedParentPath } from "./PathSafety";

export interface BplHomeSearchInputs {
  bplHome?: string;
  execPath: string;
  scriptPath?: string;
  cwd: string;
  sourceRoot: string;
}

function realExecutablePath(executable: string): string | undefined {
  if (!existsSync(executable)) return undefined;
  try {
    return realpathSync(executable);
  } catch {
    // Permission problems: fall back to the unresolved path.
    return executable;
  }
}

/**
 * Locate the BPL installation root (the directory containing `grammar/`).
 * Priority:
 * 1. BPL_HOME environment variable (if set and existing)
 * 2. Directory of the running executable, following symlinks. A compiled
 *    `bpl` reports its real path through `execPath` (its argv[1] is a virtual
 *    `/$bunfs/...` path), so `~/.local/bin/bpl -> checkout/bpl` works.
 * 3. Directory of the entry script, following symlinks (`bun index.ts`)
 * 4. The TypeScript source tree containing this module
 * 5. Current working directory (development)
 * 6. Common system install locations
 */
export function findBplHome(inputs: BplHomeSearchInputs): string {
  if (inputs.bplHome && existsSync(inputs.bplHome)) {
    assertSafeBplHomePath(inputs.bplHome, "BPL_HOME");
    return inputs.bplHome;
  }

  const candidates: Array<[string, string]> = [];
  const executable = realExecutablePath(inputs.execPath);
  if (executable) {
    candidates.push([dirname(executable), "BPL executable directory"]);
  }
  const script = inputs.scriptPath && realExecutablePath(inputs.scriptPath);
  if (script) {
    candidates.push([dirname(script), "BPL executable directory"]);
  }
  candidates.push(
    [inputs.sourceRoot, "BPL source directory"],
    [inputs.cwd, "BPL working directory"],
    ["/usr/local/lib/bpl", "BPL install directory"],
    ["/usr/lib/bpl", "BPL install directory"],
    ["/opt/bpl", "BPL install directory"],
  );

  for (const [candidate, label] of candidates) {
    if (existsSync(resolve(candidate, "grammar"))) {
      assertSafeBplHomePath(candidate, label);
      return candidate;
    }
  }

  // Fall back to the executable directory even without a grammar so the
  // later missing-resource error names a meaningful location.
  return dirname(executable ?? inputs.execPath);
}

/**
 * Get the BPL installation root directory; see findBplHome for the order.
 */
export function getBplHome(): string {
  return findBplHome({
    bplHome: process.env.BPL_HOME,
    execPath: process.execPath,
    scriptPath: process.argv[1],
    cwd: process.cwd(),
    sourceRoot: resolve(__dirname, "../.."),
  });
}

/**
 * Resolve a path relative to BPL_HOME
 */
export function resolveBplPath(...pathSegments: string[]): string {
  const bplHome = getBplHome();
  return resolve(bplHome, ...pathSegments);
}

function assertSafeBplHomePath(bplHome: string, label: string): void {
  const symlinkedParent = findSymlinkedParentPath(bplHome);
  if (!symlinkedParent) return;

  throw new Error(
    `${label} parent path contains a symbolic link: ${symlinkedParent}`,
  );
}

/**
 * Get the grammar directory path
 */
export function getGrammarPath(): string {
  return resolveBplPath("grammar");
}

/**
 * Get the standard library path
 */
export function getLibPath(): string {
  return resolveBplPath("lib");
}

/**
 * Get the bpl_modules directory path (relative to a project directory)
 */
export function getBplModulesPath(projectDir: string): string {
  return resolve(projectDir, "bpl_modules");
}
