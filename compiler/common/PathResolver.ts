/**
 * Path Resolution Utilities
 *
 * Provides centralized path resolution using BPL_HOME environment variable
 * to ensure the compiler can locate the standard library from anywhere.
 */

import { existsSync, realpathSync } from "fs";
import { dirname, resolve } from "path";
import { getEmbeddedHome } from "./EmbeddedHome";
import { findSymlinkedParentPath } from "./PathSafety";

/** Whether this process is a `bun build --compile` executable. */
export function isCompiledExecutable(): boolean {
  // The entry of a compiled executable lives in Bun's virtual filesystem:
  // `/$bunfs/...` on Unix, `B:/~BUN/...` on Windows. Node has no `Bun`.
  const main = (globalThis as { Bun?: { main?: string } }).Bun?.main ?? "";
  return main.includes("$bunfs") || main.includes("~BUN");
}

export interface BplHomeSearchInputs {
  bplHome?: string;
  execPath: string;
  scriptPath?: string;
  sourceRoot: string;
  cwd: string;
  /** Running as a `bun build --compile` executable rather than from source. */
  compiled: boolean;
  /** Unpacks the bundled standard library and returns its root. */
  embeddedHome: () => string;
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

/** Where the installation root was found, for `bpl doctor`. */
export type BplHomeSource =
  | "BPL_HOME"
  | "executable location"
  | "CLI script location"
  | "source checkout"
  | "working directory"
  | "embedded";

/**
 * Locate the BPL installation root (the directory containing
 * `lib/errors.bpl`, the implicit prelude). Priority:
 * 1. BPL_HOME environment variable (if set and existing)
 * 2. A compiled `bpl`: the directory of the executable, following symlinks.
 *    It reports its real path through `execPath` (its argv[1] is a virtual
 *    `/$bunfs/...` path), so `~/.local/bin/bpl -> checkout/bpl` works.
 * 3. From source: the directory of the entry script, following symlinks
 *    (`bun index.ts`), the source tree containing this module, then the
 *    working directory (an editor extension opened on a checkout).
 * 4. The standard library bundled into the compiler, unpacked into the cache.
 */
export function findBplHome(inputs: BplHomeSearchInputs): string {
  return findBplHomeWithSource(inputs).path;
}

export function findBplHomeWithSource(inputs: BplHomeSearchInputs): {
  path: string;
  source: BplHomeSource;
} {
  if (inputs.bplHome && existsSync(inputs.bplHome)) {
    assertSafeBplHomePath(inputs.bplHome, "BPL_HOME");
    return { path: inputs.bplHome, source: "BPL_HOME" };
  }

  const candidates: Array<[string, string, BplHomeSource]> = [];
  if (inputs.compiled) {
    const executable = realExecutablePath(inputs.execPath);
    if (executable) {
      candidates.push([
        dirname(executable),
        "BPL executable directory",
        "executable location",
      ]);
    }
  } else {
    const script = inputs.scriptPath && realExecutablePath(inputs.scriptPath);
    if (script) {
      candidates.push([
        dirname(script),
        "BPL executable directory",
        "CLI script location",
      ]);
    }
    candidates.push(
      [inputs.sourceRoot, "BPL source directory", "source checkout"],
      [inputs.cwd, "BPL working directory", "working directory"],
    );
  }

  for (const [candidate, label, source] of candidates) {
    if (existsSync(resolve(candidate, "lib", "errors.bpl"))) {
      assertSafeBplHomePath(candidate, label);
      return { path: candidate, source };
    }
  }

  return { path: inputs.embeddedHome(), source: "embedded" };
}

/**
 * Get the BPL installation root directory; see findBplHome for the order.
 */
export function getBplHome(): string {
  return getBplHomeWithSource().path;
}

export function getBplHomeWithSource(): {
  path: string;
  source: BplHomeSource;
} {
  return findBplHomeWithSource({
    bplHome: process.env.BPL_HOME,
    execPath: process.execPath,
    scriptPath: process.argv[1],
    sourceRoot: resolve(__dirname, "../.."),
    cwd: process.cwd(),
    compiled: isCompiledExecutable(),
    embeddedHome: getEmbeddedHome,
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
