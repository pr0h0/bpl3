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
import { findCaseMismatchPath } from "../common/PathSafety";
import { walkAST } from "../common/ASTTraversal";
import { Parser } from "../frontend/Parser";
import type { PackageManagerOptions } from "./PackageManager";
import { PRIMITIVE_STRUCT_MAP } from "./BuiltinTypes";
import type { PackageResolutionTrace } from "./PackageResolver";
import { SymbolTable } from "./SymbolTable";

import type * as AST from "../common/AST";

type PackageResolverApi = typeof import("./PackageResolver");

export const MODULE_NOT_FOUND_CODE = "BPL_MODULE_NOT_FOUND";
export const MODULE_FILE_NOT_FOUND_CODE = "BPL_MODULE_FILE_NOT_FOUND";
export const MODULE_PATH_NOT_FILE_CODE = "BPL_MODULE_PATH_NOT_FILE";
export const MODULE_PATH_SYMLINK_CODE = "BPL_MODULE_PATH_SYMLINK";
export const MODULE_PATH_CASE_MISMATCH_CODE =
  "BPL_MODULE_PATH_CASE_MISMATCH";
export const IMPORT_STD_PATH_UNSAFE_CODE = "BPL_IMPORT_STD_PATH_UNSAFE";
export const IMPORT_STD_PATH_UNSAFE_HINT =
  "Use std/<path> or std\\<path> without empty, '.', or '..' path segments.";

export const MODULE_RESOLUTION_FAILURE_CODES = [
  MODULE_NOT_FOUND_CODE,
  MODULE_FILE_NOT_FOUND_CODE,
  MODULE_PATH_NOT_FILE_CODE,
  MODULE_PATH_SYMLINK_CODE,
  MODULE_PATH_CASE_MISMATCH_CODE,
  IMPORT_STD_PATH_UNSAFE_CODE,
] as const;

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

const PRIMITIVE_WRAPPER_TYPE_NAMES = new Set(
  Object.values(PRIMITIVE_STRUCT_MAP),
);
const PRIMITIVE_BASIC_TYPE_NAMES = new Set(Object.keys(PRIMITIVE_STRUCT_MAP));
const PRIMITIVE_WRAPPER_METHOD_NAMES = new Set([
  "toString",
  "popCount",
  "leadingZeros",
  "trailingZeros",
  "byteSwap",
  "reverseBits",
]);

export class ModuleResolver {
  /** Cache of loaded modules by absolute path */
  private modules: Map<string, ModuleInfo> = new Map();
  private caseMismatchDirectoryEntries = new Map<string, string[] | null>();
  private resolvedExplicitStdImports = new Map<string, string>();

  /** Standard library location */
  private stdLibPath: string;

  /** Module search paths */
  private searchPaths: string[] = [];
  private packageManagerOptions: PackageManagerOptions = {};

  /** Supported file extensions */
  private readonly SUPPORTED_EXTENSIONS = [".bpl", ".x", ""];

  constructor(
    options: {
      stdLibPath?: string;
      searchPaths?: string[];
      packageManagerOptions?: PackageManagerOptions;
    } = {},
  ) {
    // Use PathResolver to get the standard library path from BPL_HOME
    this.stdLibPath = options.stdLibPath || getLibPath();
    if (!this.stdLibPath) {
      compilerLog.error("stdLibPath is undefined!");
    }
    this.searchPaths = options.searchPaths || [];
    this.packageManagerOptions = options.packageManagerOptions || {};
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
    const directResult = this.tryResolveModuleCandidate(filePath, {
      allowDirectoryIndex: true,
    });
    if (directResult) {
      return directResult;
    }

    // Try with extensions
    for (const ext of this.SUPPORTED_EXTENSIONS) {
      const withExt = filePath + ext;
      const result = this.tryResolveModuleCandidate(withExt, {
        allowDirectoryIndex: false,
      });
      if (result) {
        return result;
      }
    }

    return null;
  }

  private tryResolveModuleCandidate(
    candidatePath: string,
    options: { allowDirectoryIndex: boolean },
  ): string | null {
    const caseMismatchPath = findCaseMismatchPath(candidatePath, {
      directoryEntries: this.caseMismatchDirectoryEntries,
    });
    if (caseMismatchPath) {
      throw this.createModuleCaseMismatchError(
        candidatePath,
        caseMismatchPath,
      );
    }

    const stat = this.tryLstat(candidatePath);
    if (!stat) {
      return null;
    }

    if (stat.isSymbolicLink()) {
      let targetStat: fs.Stats;
      try {
        targetStat = fs.statSync(candidatePath);
      } catch {
        throw new CompilerError(
          `Module path is a symbolic link: ${candidatePath}`,
          "Use a real .bpl file path or repair the symlink target.",
          {
            file: candidatePath,
            startLine: 0,
            startColumn: 0,
            endLine: 0,
            endColumn: 0,
          },
          MODULE_PATH_SYMLINK_CODE,
        );
      }

      if (targetStat.isFile()) {
        return this.normalizePath(candidatePath);
      }

      if (targetStat.isDirectory() && options.allowDirectoryIndex) {
        return this.tryResolveDirectoryIndex(candidatePath);
      }

      return null;
    }

    if (stat.isFile()) {
      return this.normalizePath(candidatePath);
    }

    if (stat.isDirectory() && options.allowDirectoryIndex) {
      return this.tryResolveDirectoryIndex(candidatePath);
    }

    return null;
  }

  private createModuleCaseMismatchError(
    requestedPath: string,
    actualPath: string,
  ): CompilerError {
    return new CompilerError(
      `Module path casing does not match filesystem: requested ${requestedPath}, actual ${actualPath}`,
      `Use the exact filesystem casing: ${actualPath}.`,
      {
        file: requestedPath,
        startLine: 0,
        startColumn: 0,
        endLine: 0,
        endColumn: 0,
      },
      MODULE_PATH_CASE_MISMATCH_CODE,
    );
  }

  private tryResolveDirectoryIndex(directoryPath: string): string | null {
    for (const indexName of ["index.bpl", "index.x"]) {
      const indexPath = path.join(directoryPath, indexName);
      const result = this.tryResolveModuleCandidate(indexPath, {
        allowDirectoryIndex: false,
      });
      if (result) {
        return result;
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
        MODULE_NOT_FOUND_CODE,
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
        MODULE_NOT_FOUND_CODE,
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
    if (importSource.startsWith("std/") || importSource.startsWith("std\\")) {
      const relativePath = importSource.substring(4);
      if (!isSafeStandardLibraryImportPath(relativePath)) {
        throw new CompilerError(
          `Unsafe standard library import: ${importSource}`,
          IMPORT_STD_PATH_UNSAFE_HINT,
          {
            file: fromFile,
            startLine: 0,
            startColumn: 0,
            endLine: 0,
            endColumn: 0,
          },
          IMPORT_STD_PATH_UNSAFE_CODE,
        );
      }

      const cached = this.resolvedExplicitStdImports.get(importSource);
      if (cached) {
        return cached;
      }

      const stdPath = path.join(
        this.stdLibPath,
        ...relativePath.split(/[\\/]/),
      );
      const result = this.tryResolveWithExtensions(stdPath);
      if (result) {
        this.resolvedExplicitStdImports.set(importSource, result);
        return result;
      }

      throw new CompilerError(
        `Standard library module not found: ${importSource} (resolved to ${stdPath})`,
        `Check that the module exists inside the configured standard library at ${this.stdLibPath}. Explicit std/ and std\\ imports do not fall back to package resolution.`,
        {
          file: fromFile,
          startLine: 0,
          startColumn: 0,
          endLine: 0,
          endColumn: 0,
        },
        MODULE_NOT_FOUND_CODE,
      );
    }

    // Try to resolve as a package import
    const {
      formatPackageResolutionHint,
      getPackageResolutionFailureCode,
      resolvePackageImport,
    } = getPackageResolverApi();
    const packageResolutionOptions = {
      globalPackageDir: this.packageManagerOptions.globalPackageDir,
    };
    const packageTraces: PackageResolutionTrace[] = [];
    try {
      // Prefer the importing file's package tree so absolute builds from an
      // unrelated cwd do not shadow project-local dependencies.
      const fromFilePackage = resolvePackageImport(
        importSource,
        path.dirname(fromFile),
        packageResolutionOptions,
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
        const cwdPackage = resolvePackageImport(
          importSource,
          process.cwd(),
          packageResolutionOptions,
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
    const packageFailureCode = specificPackageFailure
      ? getPackageResolutionFailureCode(specificPackageFailure)
      : undefined;

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
      packageFailureCode ?? MODULE_NOT_FOUND_CODE,
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
    const parser = new Parser(content, modulePath);
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
        MODULE_FILE_NOT_FOUND_CODE,
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
        MODULE_PATH_SYMLINK_CODE,
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
        MODULE_PATH_NOT_FILE_CODE,
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

    const primitivesPath = this.normalizePath(
      path.join(this.stdLibPath, "primitives.bpl"),
    );
    if (
      fs.existsSync(primitivesPath) &&
      (this.modules.has(primitivesPath) ||
        this.loadedModulesMentionPrimitiveWrappers())
    ) {
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
    this.caseMismatchDirectoryEntries.clear();
    this.resolvedExplicitStdImports.clear();
  }

  /**
   * Get all loaded modules
   */
  getAllModules(): ModuleInfo[] {
    return Array.from(this.modules.values());
  }

  private loadedModulesMentionPrimitiveWrappers(): boolean {
    for (const module of this.modules.values()) {
      if (moduleMentionsPrimitiveWrapper(module.ast)) {
        return true;
      }
    }

    return false;
  }
}

function moduleMentionsPrimitiveWrapper(program: AST.Program): boolean {
  const primitiveValueNames = collectPrimitiveValueNames(program);
  const primitiveReturningFunctions = collectPrimitiveReturningFunctions(program);

  let found = false;
  walkAST(program, (node) => {
    if (
      node.kind === "BasicType" &&
      PRIMITIVE_WRAPPER_TYPE_NAMES.has((node as AST.BasicTypeNode).name)
    ) {
      found = true;
      return false;
    }

    if (
      node.kind === "Identifier" &&
      PRIMITIVE_WRAPPER_TYPE_NAMES.has((node as AST.IdentifierExpr).name)
    ) {
      found = true;
      return false;
    }

    if (node.kind === "Member") {
      const member = node as AST.MemberExpr;
      if (
        PRIMITIVE_WRAPPER_METHOD_NAMES.has(member.property) &&
        expressionMayBePrimitiveValue(
          member.object,
          primitiveValueNames,
          primitiveReturningFunctions,
        )
      ) {
        found = true;
        return false;
      }
    }

    if (node.kind === "InterpolatedString") {
      const interpolated = node as AST.InterpolatedStringExpr;
      if (
        interpolated.parts.some((part) =>
          expressionMayBePrimitiveValue(
            part,
            primitiveValueNames,
            primitiveReturningFunctions,
          ),
        )
      ) {
        found = true;
        return false;
      }
    }
  });

  return found;
}

function collectPrimitiveValueNames(program: AST.Program): Set<string> {
  const names = new Set<string>();
  const primitiveReturningFunctions = collectPrimitiveReturningFunctions(program);

  walkAST(program, (node) => {
    if (node.kind === "FunctionDecl") {
      const decl = node as AST.FunctionDecl;
      for (const param of decl.params) {
        if (isPrimitiveValueType(param.type)) {
          names.add(param.name);
        }
      }
      return;
    }

    if (node.kind !== "VariableDecl") {
      return;
    }

    const decl = node as AST.VariableDecl;
    if (typeof decl.name !== "string") {
      return;
    }

    if (
      (decl.typeAnnotation && isPrimitiveValueType(decl.typeAnnotation)) ||
      (!decl.typeAnnotation &&
        decl.initializer &&
        expressionMayBePrimitiveValue(
          decl.initializer,
          names,
          primitiveReturningFunctions,
        ))
    ) {
      names.add(decl.name);
    }
  });

  return names;
}

function collectPrimitiveReturningFunctions(program: AST.Program): Set<string> {
  const names = new Set<string>();

  walkAST(program, (node) => {
    if (node.kind !== "FunctionDecl") {
      return;
    }

    const decl = node as AST.FunctionDecl;
    if (isPrimitiveValueType(decl.returnType)) {
      names.add(decl.name);
    }
  });

  return names;
}

function expressionMayBePrimitiveValue(
  expr: AST.Expression,
  primitiveValueNames: Set<string>,
  primitiveReturningFunctions: Set<string>,
): boolean {
  switch (expr.kind) {
    case "Literal": {
      const literal = expr as AST.LiteralExpr;
      return (
        literal.type === "number" ||
        literal.type === "bool" ||
        literal.type === "char"
      );
    }
    case "Identifier":
      return primitiveValueNames.has((expr as AST.IdentifierExpr).name);
    case "Cast":
      return isPrimitiveValueType((expr as AST.CastExpr).targetType);
    case "Call": {
      const call = expr as AST.CallExpr;
      if (
        call.callee.kind === "Identifier" &&
        primitiveReturningFunctions.has((call.callee as AST.IdentifierExpr).name)
      ) {
        return true;
      }

      return false;
    }
    case "Unary":
      return expressionMayBePrimitiveValue(
        (expr as AST.UnaryExpr).operand,
        primitiveValueNames,
        primitiveReturningFunctions,
      );
    case "Binary": {
      const binary = expr as AST.BinaryExpr;
      return (
        expressionMayBePrimitiveValue(
          binary.left,
          primitiveValueNames,
          primitiveReturningFunctions,
        ) ||
        expressionMayBePrimitiveValue(
          binary.right,
          primitiveValueNames,
          primitiveReturningFunctions,
        )
      );
    }
    case "Ternary": {
      const ternary = expr as AST.TernaryExpr;
      return (
        expressionMayBePrimitiveValue(
          ternary.trueExpr,
          primitiveValueNames,
          primitiveReturningFunctions,
        ) ||
        expressionMayBePrimitiveValue(
          ternary.falseExpr,
          primitiveValueNames,
          primitiveReturningFunctions,
        )
      );
    }
    case "Sizeof":
      return true;
    default:
      return false;
  }
}

function isPrimitiveValueType(type: AST.TypeNode | undefined): boolean {
  return (
    type?.kind === "BasicType" &&
    type.pointerDepth === 0 &&
    type.arrayDimensions.length === 0 &&
    PRIMITIVE_BASIC_TYPE_NAMES.has(type.name)
  );
}

function isTerminalPackageResolutionFailure(
  trace: PackageResolutionTrace,
): boolean {
  return Boolean(
    trace.failureReason && trace.failureReason !== "package-not-found",
  );
}

let packageResolverApi: PackageResolverApi | undefined;

function getPackageResolverApi(): PackageResolverApi {
  return (packageResolverApi ??= require("./PackageResolver"));
}

export function isSafeStandardLibraryImportPath(relativePath: string): boolean {
  if (relativePath.length === 0) return false;
  if (!relativePath.includes("/") && !relativePath.includes("\\")) {
    return relativePath !== "." && relativePath !== "..";
  }
  if (path.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath)) {
    return false;
  }

  return relativePath
    .split(/[\\/]/)
    .every((part) => part.length > 0 && part !== "." && part !== "..");
}
