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
import { lexWithGrammar } from "../frontend/GrammarLexer";
import { Parser } from "../frontend/Parser";
import { TypeChecker } from "./TypeChecker";
import { SymbolTable } from "./SymbolTable";
import { CompilerError } from "../common/CompilerError";
import { PackageManager } from "./PackageManager";
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
  private readonly SUPPORTED_EXTENSIONS = [".x", ".bpl", ""];

  constructor(options: { stdLibPath?: string; searchPaths?: string[] } = {}) {
    this.stdLibPath = options.stdLibPath || path.join(__dirname, "../../lib");
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
      } catch (e) {
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
        for (const indexName of ["index.x", "index.bpl"]) {
          const indexPath = path.join(filePath, indexName);
          if (fs.existsSync(indexPath)) {
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
      throw new Error(
        `Module not found: ${importSource} (absolute path does not exist)`,
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

      throw new Error(
        `Module not found: ${importSource} (resolved to ${resolved})`,
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
      const stdPath = path.join(this.stdLibPath, relativePath);
      const result = this.tryResolveWithExtensions(stdPath);
      if (result) {
        return result;
      }
    }

    // Try to resolve as a package import
    const packageManager = new PackageManager();
    try {
      // First try from current working directory
      let packagePath = packageManager.resolvePackage(
        importSource,
        process.cwd(),
      );
      if (packagePath) {
        const result = this.tryResolveWithExtensions(packagePath);
        if (result) return result;
      }

      // Then try from the file's directory
      packagePath = packageManager.resolvePackage(
        importSource,
        path.dirname(fromFile),
      );
      if (packagePath) {
        const result = this.tryResolveWithExtensions(packagePath);
        if (result) return result;
      }
    } catch (e) {
      // Package not found, continue with other search paths
    }

    // Search in additional paths
    for (const searchPath of this.searchPaths) {
      const resolved = path.join(searchPath, importSource);
      const result = this.tryResolveWithExtensions(resolved);
      if (result) {
        return result;
      }
    }

    throw new Error(`Module not found: ${importSource}`);
  }

  /**
   * Load a module and its dependencies recursively
   */
  private loadModule(
    modulePath: string,
    visited: Set<string> = new Set(),
  ): ModuleInfo {
    // Check cache
    if (this.modules.has(modulePath)) {
      return this.modules.get(modulePath)!;
    }

    // Detect circular dependencies
    if (visited.has(modulePath)) {
      throw new Error(`Circular dependency detected: ${modulePath}`);
    }
    visited.add(modulePath);

    // Read and parse
    const content = fs.readFileSync(modulePath, "utf-8");
    const tokens = lexWithGrammar(content, modulePath);
    const parser = new Parser(content, modulePath, tokens);
    const ast = parser.parse();

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
            "Check that the module path is correct and the file exists.",
            importStmt.location,
          );
        }
      }
    }

    return moduleInfo;
  }

  /**
   * Topological sort of modules based on dependencies
   * Returns modules in order they should be type-checked
   */
  private topologicalSort(entryPoint: string): string[] {
    const sorted: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (modulePath: string) => {
      if (visited.has(modulePath)) return;

      if (visiting.has(modulePath)) {
        throw new Error(
          `Circular dependency detected involving: ${modulePath}`,
        );
      }

      visiting.add(modulePath);

      const module = this.modules.get(modulePath);
      if (!module) {
        throw new Error(`Module not found in cache: ${modulePath}`);
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
    const entryPath = path.resolve(entryFile);

    // Load all modules recursively
    this.loadModule(entryPath);

    // Get topologically sorted order
    const sortedPaths = this.topologicalSort(entryPath);

    // Return module infos in order
    return sortedPaths.map((p) => this.modules.get(p)!);
  }

  /**
   * Get a module by path
   */
  getModule(modulePath: string): ModuleInfo | undefined {
    return this.modules.get(path.resolve(modulePath));
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
