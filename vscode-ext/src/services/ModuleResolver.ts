/**
 * Module Resolution Service
 * Handles resolving imports from various sources:
 * - Local files (./file.bpl, ../file.bpl)
 * - Standard library (std/*)
 * - Local packages (bpl_modules/)
 * - Workspace packages (packages/)
 * - Global packages (~/.bpl/packages/)
 */

import * as fs from "fs";
import * as path from "path";
import { resolvePackageImport } from "../../../compiler/middleend/PackageResolver";

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
    if (
      importPath === "std" ||
      importPath.startsWith("std/") ||
      importPath.startsWith("std\\")
    ) {
      return this.resolveStdLib(importPath, currentDir);
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

    // 4. Package imports (no prefix). Use the compiler's package resolver so
    // editor links, completions, and CLI builds agree on lookup order.
    const packageResolution = resolvePackageImport(importPath, currentDir);
    if (packageResolution.result) {
      return {
        filePath: packageResolution.result.filePath,
        source:
          packageResolution.result.source === "global"
            ? "global-package"
            : "local-package",
        packageName: packageResolution.result.packageName,
      };
    }

    return null;
  }

  /**
   * Resolve standard library import
   */
  private resolveStdLib(
    importPath: string,
    currentDir?: string,
  ): ResolvedModule | null {
    // Remove std/ prefix
    const stdPath =
      importPath === "std" ? "std.bpl" : importPath.replace(/^std[\/\\]/, "");

    // Try to find lib directory
    const libDir = this.findLibDirectory(currentDir);
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

  listStdLibModules(currentFilePath?: string): string[] {
    const libDir = this.findLibDirectory(
      currentFilePath ? path.dirname(currentFilePath) : undefined,
    );
    if (!libDir) return [];

    const modules = new Set<string>(["std"]);
    const visit = (dir: string, prefix = "") => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith(".")) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          visit(fullPath, `${prefix}${entry.name}/`);
        } else if (entry.isFile() && entry.name.endsWith(".bpl")) {
          const moduleName = entry.name.replace(/\.bpl$/, "");
          if (prefix || moduleName !== "std") {
            modules.add(`std/${prefix}${entry.name}`);
            modules.add(`std/${prefix}${moduleName}`);
          }
        }
      }
    };

    visit(libDir);
    return Array.from(modules).sort();
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
   * Find the lib directory for standard library
   * Checks multiple locations:
   * 1. BPL_HOME/lib (if BPL_HOME is set)
   * 2. Walk up from current directory to find lib/ with string.bpl
   */
  private findLibDirectory(startDir?: string): string | null {
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

    // 2. Walk up from the current file directory, then cwd, to find lib/
    const roots = [startDir, process.cwd()].filter(
      (candidate): candidate is string => Boolean(candidate),
    );
    const maxDepth = 10;

    for (const root of roots) {
      let dir = root;
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
