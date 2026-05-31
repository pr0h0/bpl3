/**
 * Path Resolution Utilities
 *
 * Provides centralized path resolution using BPL_HOME environment variable
 * to ensure the compiler can locate resources (grammar, lib) from anywhere.
 */

import { existsSync, realpathSync, lstatSync } from "fs";
import { dirname, resolve } from "path";
import { findSymlinkedParentPath } from "./PathSafety";

/**
 * Get the BPL installation root directory
 * Priority:
 * 1. BPL_HOME environment variable (if set and valid)
 * 2. Directory containing the bpl executable (resolving symlinks)
 * 3. Current working directory (development mode)
 * 4. __dirname fallback (for non-compiled mode)
 */
export function getBplHome(): string {
  // 1. Check BPL_HOME environment variable
  const bplHome = process.env.BPL_HOME;
  if (bplHome && existsSync(bplHome)) {
    assertSafeBplHomePath(bplHome, "BPL_HOME");
    return bplHome;
  }

  // 2. Try to determine from executable location
  let execPath = process.argv[1] || process.execPath;

  // If the executable is a symlink, resolve it to the real path
  // This handles cases like /usr/bin/bpl -> /home/user/Projects/bpl3/bpl-wrapper.sh
  if (existsSync(execPath)) {
    try {
      const stats = lstatSync(execPath);
      if (stats.isSymbolicLink()) {
        execPath = realpathSync(execPath);
      }
    } catch {
      // If realpath fails, continue with original path - this can happen with permission issues
    }
  }

  const execDir = dirname(execPath);

  // Check if grammar exists in execDir (compiled binary case)
  if (existsSync(resolve(execDir, "grammar"))) {
    assertSafeBplHomePath(execDir, "BPL executable directory");
    return execDir;
  }

  // 3. Try current working directory (development)
  if (existsSync(resolve(process.cwd(), "grammar"))) {
    assertSafeBplHomePath(process.cwd(), "BPL working directory");
    return process.cwd();
  }

  // 4. Try __dirname/../.. (TypeScript source case)
  const sourceRoot = resolve(__dirname, "../..");
  if (existsSync(resolve(sourceRoot, "grammar"))) {
    assertSafeBplHomePath(sourceRoot, "BPL source directory");
    return sourceRoot;
  }

  // 5. Try common install locations
  const commonPaths = ["/usr/local/lib/bpl", "/usr/lib/bpl", "/opt/bpl"];

  for (const p of commonPaths) {
    if (existsSync(resolve(p, "grammar"))) {
      assertSafeBplHomePath(p, "BPL install directory");
      return p;
    }
  }

  // Fallback: return execDir even if grammar not found
  // This will cause a more specific error message later
  return execDir;
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
