/**
 * Module Resolution System
 *
 * Implements a two-phase module compilation strategy:
 * 1. Dependency Graph Construction: Resolve all imports and build dependency tree
 * 2. Ordered Compilation: Process modules in topological order
 *
 * This allows for:
 * - Cross-module type checking
 * - Circular dependency detection
 * - Module caching and incremental compilation
 * - Proper symbol resolution across module boundaries
 */

import * as fs from "fs";
import * as path from "path";

import { getLibPath } from "../common/PathResolver";
import { CompilerError } from "../common/CompilerError";
import { compilerLog } from "../common/Logger";
import { lexWithGrammar } from "../frontend/GrammarLexer";
import { Parser } from "../frontend/Parser";
import { PackageManager } from "./PackageManager";
import {
  formatPackageResolutionHint,
  type PackageResolutionTrace,
} from "./PackageResolver";
import { SymbolTable } from "./SymbolTable";

import type * as AST from "../common/AST";
export interface ModuleInfo {
  /** Absolute path to the module file */
  path: string;

  /** Parsed AST */
  ast: AST.Program;

  /** Module's symbol table (after type checking) */
  symbolTable?: SymbolTable;

  /** Modules this module depends on (imports) */
  dependencies: Set<string>;

  /** Whether this module has been type-checked */
  checked: boolean;

  /** Exported symbols from this module */
  exports: Map<string, { kind: string; type?: AST.TypeNode }>;
}

export class ModuleResolver {
  /** Cache of loaded modules by absolute path */
  private modules: Map<string, ModuleInfo> = new Map();

  /** Standard library location */
  private stdLibPath: string;

  /** Module search paths */
  private searchPaths: string[] = [];

  /** Supported file extensions */
  private readonly SUPPORTED_EXTENSIONS = [".bpl", ".x", ""];

  constructor(options: { stdLibPath?: string; searchPaths?: string[] } = {}) {
    // Use PathResolver to get the standard library path from BPL_HOME
    this.stdLibPath = options.stdLibPath || getLibPath();
    if (!this.stdLibPath) {
      compilerLog.error("stdLibPath is undefined!");
    }
    this.searchPaths = options.searchPaths || [];
  }

  /**
   * Normalize a file path and resolve symlinks
   */
  private normalizePath(filePath: string): string {
    let normalized = path.normalize(filePath);

    // Resolve symlinks if they exist
    if (fs.existsSync(normalized)) {
      try {
        normalized = fs.realpathSync(normalized);
      } catch (_e) {
        // If realpath fails, continue with normalized path
      }
    }

    return normalized;
  }

  /**
   * Try to resolve a path with various extensions
   */
  private tryResolveWithExtensions(filePath: string): string | null {
    const exists = fs.existsSync(filePath);
    // Check if path exists as-is
    if (exists) {
      const stat = fs.statSync(filePath);
      if (stat.isFile()) {
        return this.normalizePath(filePath);
      }
      if (stat.isDirectory()) {
        // Try index files in the directory
        for (const indexName of ["index.bpl", "index.x"]) {
          const indexPath = path.join(filePath, indexName);
          if (fs.existsSync(indexPath) && fs.statSync(indexPath).isFile()) {
            return this.normalizePath(indexPath);
          }
        }
      }
    }

    // Try with extensions
    for (const ext of this.SUPPORTED_EXTENSIONS) {
      const withExt = filePath + ext;
      if (fs.existsSync(withExt)) {
        const stat = fs.statSync(withExt);
        if (stat.isFile()) {
          return this.normalizePath(withExt);
        }
      }
    }

    return null;
  }

  /**
   * Resolve a module path from an import statement
   * Supports: relative paths, absolute paths, stdlib, and packages
   */
  resolveModulePath(importSource: string, fromFile: string): string {
    // Handle absolute paths
    if (path.isAbsolute(importSource)) {
      const resolved = this.tryResolveWithExtensions(importSource);
      if (resolved) {
        return resolved;
      }
      throw new CompilerError(
        `Module not found: ${importSource} (absolute path does not exist)`,
        "Check if the file exists.",
        {
          file: fromFile,
          startLine: 0,
          startColumn: 0,
          endLine: 0,
          endColumn: 0,
        },
      );
    }

    // Handle relative imports
    if (importSource.startsWith("./") || importSource.startsWith("../")) {
      const fromDir = path.dirname(fromFile);
      const resolved = path.resolve(fromDir, importSource);
      const result = this.tryResolveWithExtensions(resolved);

      if (result) {
        return result;
      }

      throw new CompilerError(
        `Module not found: ${importSource} (resolved to ${resolved})`,
        "Check if the file exists.",
        {
          file: fromFile,
          startLine: 0,
          startColumn: 0,
          endLine: 0,
          endColumn: 0,
        },
      );
    }

    // Handle standard library imports (e.g., "std", "io", "math")
    if (!importSource.includes("/") && !importSource.includes("\\")) {
      const stdPath = path.join(this.stdLibPath, `${importSource}.x`);
      const result = this.tryResolveWithExtensions(stdPath);
      if (result) {
        return result;
      }

      // Also try in stdlib subdirectories (e.g., "std/io")
      const stdSubPath = path.join(this.stdLibPath, importSource);
      const subResult = this.tryResolveWithExtensions(stdSubPath);
      if (subResult) {
        return subResult;
      }
    }

    // Handle explicit std/ prefix
    if (importSource.startsWith("std/")) {
      const relativePath = importSource.substring(4); // Remove "std/"
      if (!isSafeStandardLibraryImportPath(relativePath)) {
        throw new CompilerError(
          `Unsafe standard library import: ${importSource}`,
          "Use std/<path> without empty, '.', or '..' path segments.",
          {
            file: fromFile,
            startLine: 0,
            startColumn: 0,
            endLine: 0,
            endColumn: 0,
          },
        );
      }

      const stdPath = path.join(this.stdLibPath, relativePath);
      const result = this.tryResolveWithExtensions(stdPath);
      if (result) {
        return result;
      }
    }

    // Try to resolve as a package import
    const packageManager = new PackageManager();
    const packageTraces: PackageResolutionTrace[] = [];
    try {
      // Prefer the importing file's package tree so absolute builds from an
      // unrelated cwd do not shadow project-local dependencies.
      const fromFilePackage = packageManager.resolvePackageWithDiagnostics(
        importSource,
        path.dirname(fromFile),
      );
      packageTraces.push(fromFilePackage.trace);
      if (fromFilePackage.result) {
        const result = this.tryResolveWithExtensions(
          fromFilePackage.result.filePath,
        );
        if (result) return result;
      }

      if (!isTerminalPackageResolutionFailure(fromFilePackage.trace)) {
        // Then try from current working directory for REPL/scripts that import
        // packages without an on-disk project root near the source file.
        const cwdPackage = packageManager.resolvePackageWithDiagnostics(
          importSource,
          process.cwd(),
        );
        packageTraces.push(cwdPackage.trace);
        if (cwdPackage.result) {
          const result = this.tryResolveWithExtensions(
            cwdPackage.result.filePath,
          );
          if (result) return result;
        }
      }
    } catch (_e) {
      // Package not found, continue with other search paths
    }

    // Search in additional paths
    const extraSearchCandidates: string[] = [];
    if (!packageTraces.some(isTerminalPackageResolutionFailure)) {
      for (const searchPath of this.searchPaths) {
        const resolved = path.join(searchPath, importSource);
        extraSearchCandidates.push(resolved);
        const result = this.tryResolveWithExtensions(resolved);
        if (result) {
          return result;
        }
      }
    }

    const specificPackageFailure = packageTraces.find(
      (trace) =>
        trace.failureMessage && trace.failureReason !== "package-not-found",
    );

    throw new CompilerError(
      specificPackageFailure?.failureMessage
        ? `Module not found: ${importSource} (${specificPackageFailure.failureMessage})`
        : `Module not found: ${importSource}`,
      formatPackageResolutionHint(packageTraces, extraSearchCandidates),
      {
        file: fromFile,
        startLine: 0,
        startColumn: 0,
        endLine: 0,
        endColumn: 0,
      },
    );
  }

  /**
   * Load a module and its dependencies recursively
   */
  private loadModule(
    modulePath: string,
    visited: Set<string> = new Set(),
  ): ModuleInfo {
    this.assertReadableModuleFile(modulePath);

    // Check cache
    if (this.modules.has(modulePath)) {
      return this.modules.get(modulePath)!;
    }

    // Detect circular dependencies
    if (visited.has(modulePath)) {
      throw new CompilerError(
        `Circular dependency detected: ${modulePath}`,
        "Refactor code to avoid circular imports.",
        {
          file: modulePath,
          startLine: 0,
          startColumn: 0,
          endLine: 0,
          endColumn: 0,
        },
      );
    }
    visited.add(modulePath);

    // Read and parse
    const content = fs.readFileSync(modulePath, "utf-8");
    const tokens = lexWithGrammar(content, modulePath);
    const parser = new Parser(content, modulePath, tokens);
    const ast = parser.parse(true);

    // Create module info
    const moduleInfo: ModuleInfo = {
      path: modulePath,
      ast,
      dependencies: new Set(),
      checked: false,
      exports: new Map(),
    };

    // Cache it immediately to handle circular references
    this.modules.set(modulePath, moduleInfo);

    // Find all imports
    for (const stmt of ast.statements) {
      if (stmt.kind === "Import") {
        const importStmt = stmt as AST.ImportStmt;
        try {
          const depPath = this.resolveModulePath(importStmt.source, modulePath);
          moduleInfo.dependencies.add(depPath);

          // Recursively load dependency
          this.loadModule(depPath, new Set(visited));
        } catch (error) {
          throw new CompilerError(
            `Failed to resolve import '${importStmt.source}': ${
              error instanceof Error ? error.message : String(error)
            }`,
            error instanceof CompilerError
              ? error.hint
              : "Check that the module path is correct and the file exists.",
            importStmt.location,
            error instanceof CompilerError ? error.code : undefined,
          );
        }
      }
    }

    return moduleInfo;
  }

  private assertReadableModuleFile(modulePath: string): void {
    const stat = this.tryLstat(modulePath);
    if (!stat) {
      throw new CompilerError(
        `Module file not found: ${modulePath}`,
        "Check that the entry file exists and that imports resolve to files.",
        {
          file: modulePath,
          startLine: 0,
          startColumn: 0,
          endLine: 0,
          endColumn: 0,
        },
      );
    }

    if (stat.isSymbolicLink()) {
      throw new CompilerError(
        `Module path is a symbolic link: ${modulePath}`,
        "Use a real .bpl file path for the entry module.",
        {
          file: modulePath,
          startLine: 0,
          startColumn: 0,
          endLine: 0,
          endColumn: 0,
        },
      );
    }

    if (!stat.isFile()) {
      throw new CompilerError(
        `Module path is not a file: ${modulePath}`,
        "Use a .bpl file path or import a directory that contains index.bpl.",
        {
          file: modulePath,
          startLine: 0,
          startColumn: 0,
          endLine: 0,
          endColumn: 0,
        },
      );
    }
  }

  private tryLstat(filePath: string): fs.Stats | undefined {
    try {
      return fs.lstatSync(filePath);
    } catch {
      return undefined;
    }
  }

  /**
   * Topological sort of modules based on dependencies
   * Returns modules in order they should be type-checked
   * @internal Reserved for future use
   */
  private _topologicalSort(entryPoint: string): string[] {
    const sorted: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (modulePath: string) => {
      if (visited.has(modulePath)) return;

      if (visiting.has(modulePath)) {
        throw new CompilerError(
          `Circular dependency detected involving: ${modulePath}`,
          "Refactor code to avoid circular imports.",
          {
            file: modulePath,
            startLine: 0,
            startColumn: 0,
            endLine: 0,
            endColumn: 0,
          },
        );
      }

      visiting.add(modulePath);

      const module = this.modules.get(modulePath);
      if (!module) {
        throw new CompilerError(
          `Module not found in cache: ${modulePath}`,
          "Internal compiler error: module missing from cache during sort.",
          {
            file: modulePath,
            startLine: 0,
            startColumn: 0,
            endLine: 0,
            endColumn: 0,
          },
        );
      }

      // Visit dependencies first
      for (const dep of module.dependencies) {
        visit(dep);
      }

      visiting.delete(modulePath);
      visited.add(modulePath);
      sorted.push(modulePath);
    };

    visit(entryPoint);
    return sorted;
  }

  /**
   * Resolve all modules starting from entry point
   * Returns modules in dependency order
   */
  resolveModules(entryFile: string): ModuleInfo[] {
    // Normalize entry file path
    const entryPath = this.normalizePath(path.resolve(entryFile));

    // Load entry module recursively
    this.loadModule(entryPath);

    // Ensure primitives.bpl is loaded
    const primitivesPath = this.normalizePath(
      path.join(this.stdLibPath, "primitives.bpl"),
    );
    if (fs.existsSync(primitivesPath)) {
      this.loadModule(primitivesPath);
    }

    // Get topologically sorted order
    // We manually perform sort to include primitives
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const sorted: string[] = [];

    const visit = (modulePath: string) => {
      if (visited.has(modulePath)) return;
      if (visiting.has(modulePath)) {
        throw new CompilerError(
          `Circular dependency detected: ${modulePath}`,
          "Refactor code to avoid circular imports.",
          {
            file: modulePath,
            startLine: 0,
            startColumn: 0,
            endLine: 0,
            endColumn: 0,
          },
        );
      }

      visiting.add(modulePath);

      const module = this.modules.get(modulePath);
      if (!module) {
        throw new CompilerError(
          `Module not found in cache: ${modulePath}`,
          "Internal compiler error: module missing from cache.",
          {
            file: modulePath,
            startLine: 0,
            startColumn: 0,
            endLine: 0,
            endColumn: 0,
          },
        );
      }

      // Visit dependencies first
      for (const dep of module.dependencies) {
        visit(dep);
      }

      visiting.delete(modulePath);
      visited.add(modulePath);
      sorted.push(modulePath);
    };

    // Visit primitives first to ensure it's available and processed early
    if (this.modules.has(primitivesPath)) {
      visit(primitivesPath);
    }

    // Visit entry point
    visit(entryPath);

    // Return module infos in order
    return sorted.map((p) => this.modules.get(p)!);
  }

  /**
   * Get a module by path
   */
  getModule(modulePath: string): ModuleInfo | undefined {
    return this.modules.get(this.normalizePath(path.resolve(modulePath)));
  }

  /**
   * Clear module cache
   */
  clearCache() {
    this.modules.clear();
  }

  /**
   * Get all loaded modules
   */
  getAllModules(): ModuleInfo[] {
    return Array.from(this.modules.values());
  }
}

function isTerminalPackageResolutionFailure(
  trace: PackageResolutionTrace,
): boolean {
  return Boolean(
    trace.failureReason && trace.failureReason !== "package-not-found",
  );
}

export function isSafeStandardLibraryImportPath(relativePath: string): boolean {
  if (relativePath.length === 0) return false;
  if (path.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath)) {
    return false;
  }

  return relativePath
    .split(/[\\/]/)
    .every((part) => part.length > 0 && part !== "." && part !== "..");
}
