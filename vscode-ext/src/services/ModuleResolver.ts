/**
 * Module Resolution Service
 * Handles resolving imports from various sources:
 * - Local files (./file.bpl, ../file.bpl)
 * - Standard library (std/*)
 * - Local packages (bpl_modules/)
 * - Global packages (~/.bpl/packages/)
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface ResolvedModule {
  /** Absolute file path to the module */
  filePath: string;
  /** Type of module source */
  source: "local" | "stdlib" | "local-package" | "global-package";
  /** Package name if from a package */
  packageName?: string;
}

export class ModuleResolver {
  private bplHome: string | null = null;
  private cache = new Map<string, ResolvedModule | null>();

  constructor(bplHome?: string) {
    this.bplHome = bplHome || process.env.BPL_HOME || null;
  }

  /**
   * Update BPL_HOME path
   */
  setBplHome(bplHome: string | null): void {
    this.bplHome = bplHome;
    this.cache.clear(); // Clear cache when BPL_HOME changes
  }

  /**
   * Resolve an import path to an absolute file path
   * @param importPath The import path from the import statement
   * @param currentFilePath The absolute path of the file containing the import
   * @returns ResolvedModule info or null if not found
   */
  resolve(importPath: string, currentFilePath: string): ResolvedModule | null {
    const cacheKey = `${currentFilePath}:${importPath}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey) || null;
    }

    const result = this.resolveInternal(importPath, currentFilePath);
    this.cache.set(cacheKey, result);
    return result;
  }

  private resolveInternal(
    importPath: string,
    currentFilePath: string,
  ): ResolvedModule | null {
    const currentDir = path.dirname(currentFilePath);

    // 1. Standard library imports (std/*)
    if (importPath.startsWith("std/") || importPath.startsWith("std\\")) {
      return this.resolveStdLib(importPath);
    }

    // 2. Relative imports (./*, ../*)
    if (
      importPath.startsWith("./") ||
      importPath.startsWith("../") ||
      importPath.startsWith(".\\") ||
      importPath.startsWith("..\\")
    ) {
      return this.resolveRelative(importPath, currentDir);
    }

    // 3. Absolute imports (starts with /)
    if (importPath.startsWith("/")) {
      return this.resolveAbsolute(importPath);
    }

    // 4. Package imports (no prefix)
    // Try local packages first, then global packages
    const localPkg = this.resolveLocalPackage(importPath, currentDir);
    if (localPkg) return localPkg;

    const globalPkg = this.resolveGlobalPackage(importPath);
    if (globalPkg) return globalPkg;

    return null;
  }

  /**
   * Resolve standard library import
   */
  private resolveStdLib(importPath: string): ResolvedModule | null {
    // Remove std/ prefix
    const stdPath = importPath.replace(/^std[\/\\]/, "");

    // Try to find lib directory
    const libDir = this.findLibDirectory();
    if (!libDir) return null;

    const candidates = [
      path.join(libDir, stdPath),
      path.join(libDir, `${stdPath}.bpl`),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return {
          filePath: candidate,
          source: "stdlib",
        };
      }
    }

    return null;
  }

  /**
   * Resolve relative import
   */
  private resolveRelative(
    importPath: string,
    currentDir: string,
  ): ResolvedModule | null {
    const candidates = [
      path.resolve(currentDir, importPath),
      path.resolve(currentDir, `${importPath}.bpl`),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return {
          filePath: candidate,
          source: "local",
        };
      }
    }

    return null;
  }

  /**
   * Resolve absolute import
   */
  private resolveAbsolute(importPath: string): ResolvedModule | null {
    const candidates = [importPath, `${importPath}.bpl`];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return {
          filePath: candidate,
          source: "local",
        };
      }
    }

    return null;
  }

  /**
   * Resolve import from local package (bpl_modules/)
   */
  private resolveLocalPackage(
    importPath: string,
    currentDir: string,
  ): ResolvedModule | null {
    // Walk up directory tree to find bpl_modules/
    let dir = currentDir;
    const maxDepth = 10;

    for (let i = 0; i < maxDepth; i++) {
      const bplModulesDir = path.join(dir, "bpl_modules");
      if (fs.existsSync(bplModulesDir)) {
        // Parse import path: "package" or "package/subpath"
        const parts = importPath.split(/[\/\\]/);
        const packageName = parts[0];
        if (!packageName) continue;

        const subPath = parts.slice(1).join(path.sep);
        const packageDir = path.join(bplModulesDir, packageName);

        if (fs.existsSync(packageDir)) {
          // Try to resolve within package
          const resolved = this.resolveWithinPackage(
            packageDir,
            subPath,
            packageName,
          );
          if (resolved) {
            return { ...resolved, source: "local-package" };
          }
        }
      }

      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }

    return null;
  }

  /**
   * Resolve import from global package (~/.bpl/packages/)
   */
  private resolveGlobalPackage(importPath: string): ResolvedModule | null {
    const globalPackagesDir = path.join(os.homedir(), ".bpl", "packages");
    if (!fs.existsSync(globalPackagesDir)) return null;

    // Parse import path
    const parts = importPath.split(/[\/\\]/);
    const packageName = parts[0];
    if (!packageName) return null;

    const subPath = parts.slice(1).join(path.sep);

    // Try exact package name first
    const exactPath = path.join(globalPackagesDir, packageName);
    if (fs.existsSync(exactPath)) {
      const resolved = this.resolveWithinPackage(
        exactPath,
        subPath,
        packageName,
      );
      if (resolved) {
        return { ...resolved, source: "global-package" };
      }
    }

    // Find package directory with version suffix (e.g., "pkg-1.0.0")
    const packageDirs = fs
      .readdirSync(globalPackagesDir)
      .filter((name) => name.startsWith(`${packageName}-`))
      .sort()
      .reverse(); // Latest version first

    for (const packageDir of packageDirs) {
      const fullPath = path.join(globalPackagesDir, packageDir);
      const resolved = this.resolveWithinPackage(
        fullPath,
        subPath,
        packageName,
      );
      if (resolved) {
        return { ...resolved, source: "global-package" };
      }
    }

    return null;
  }

  /**
   * Resolve a subpath within a package
   */
  private resolveWithinPackage(
    packageDir: string,
    subPath: string,
    packageName: string,
  ): { filePath: string; packageName: string } | null {
    // Read package manifest to find main entry
    const manifestPath = path.join(packageDir, "bpl.json");
    let mainEntry = "index.bpl"; // Default to index.bpl

    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        if (manifest.main) {
          mainEntry = manifest.main;
        }
      } catch {
        // Ignore manifest parse errors
      }
    }

    // If no subpath, use main entry or try common entry points
    if (!subPath) {
      const entryPoints = [mainEntry, "index.bpl", "main.bpl"];
      for (const entry of entryPoints) {
        const entryPath = path.join(packageDir, entry);
        if (fs.existsSync(entryPath) && fs.statSync(entryPath).isFile()) {
          return { filePath: entryPath, packageName };
        }
      }
    }

    // Try to resolve subpath
    const candidates = [
      path.join(packageDir, subPath),
      path.join(packageDir, `${subPath}.bpl`),
      path.join(packageDir, subPath, "index.bpl"),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return { filePath: candidate, packageName };
      }
    }

    return null;
  }

  /**
   * Find the lib directory for standard library
   * Checks multiple locations:
   * 1. BPL_HOME/lib (if BPL_HOME is set)
   * 2. Walk up from current directory to find lib/ with string.bpl
   */
  private findLibDirectory(): string | null {
    // 1. Try BPL_HOME
    if (this.bplHome) {
      const candidates = [
        path.join(this.bplHome, "lib"),
        this.bplHome, // BPL_HOME might be lib itself
      ];

      for (const candidate of candidates) {
        if (
          fs.existsSync(candidate) &&
          fs.existsSync(path.join(candidate, "string.bpl"))
        ) {
          return candidate;
        }
      }
    }

    // 2. Walk up from cwd to find lib/
    let dir = process.cwd();
    const maxDepth = 10;

    for (let i = 0; i < maxDepth; i++) {
      const libDir = path.join(dir, "lib");
      if (
        fs.existsSync(libDir) &&
        fs.existsSync(path.join(libDir, "string.bpl"))
      ) {
        return libDir;
      }

      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }

    return null;
  }

  /**
   * Clear the resolution cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
