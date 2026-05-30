/**
 * Symbol Index Service
 * Maintains an index of all symbols (structs, enums, functions, types, etc.)
 * across all files in the workspace, including imports
 */

import * as fs from "fs";
import type * as AST from "../../../compiler/common/AST";
import { Parser } from "../../../compiler/frontend/Parser";
import { ModuleResolver } from "./ModuleResolver";
import { debugLog } from "./utils";

export interface SymbolInfo {
  name: string;
  kind:
    | "struct"
    | "enum"
    | "function"
    | "type-alias"
    | "variable"
    | "constant"
    | "spec";
  filePath: string;
  location: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  /** The declaration node */
  declaration: AST.Statement;
  /** Documentation comment if available */
  documentation?: string;
  /** For structs/enums: list of methods */
  methods?: MethodInfo[];
  /** For structs: list of fields */
  fields?: FieldInfo[];
  /** For enums: list of variants */
  variants?: VariantInfo[];
  /** For functions: parameter and return type info */
  signature?: FunctionSignature;
  /** Module source */
  source?: "local" | "stdlib" | "local-package" | "global-package";
  /** Package name if from a package */
  packageName?: string;
}

export interface MethodInfo {
  name: string;
  isStatic: boolean;
  signature: FunctionSignature;
  documentation?: string;
  location: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
}

export interface FieldInfo {
  name: string;
  type: string;
  documentation?: string;
}

export interface VariantInfo {
  name: string;
  dataType?: string;
}

export interface FunctionSignature {
  parameters: Array<{
    name: string;
    type: string;
    isVariadic?: boolean;
  }>;
  returnType: string;
  isVariadic?: boolean;
}

export class SymbolIndex {
  private symbols = new Map<string, SymbolInfo[]>(); // name -> symbols
  private fileSymbols = new Map<string, Set<string>>(); // filePath -> symbol names
  private fileModTime = new Map<string, number>(); // filePath -> modification time
  private resolver: ModuleResolver;
  private currentBplHome: string | null = null;

  constructor(bplHome?: string) {
    this.resolver = new ModuleResolver(bplHome);
    this.currentBplHome = bplHome || null;
  }

  /**
   * Update BPL_HOME and clear caches only if it changed
   */
  setBplHome(bplHome: string | null): void {
    if (this.currentBplHome === bplHome) {
      return; // No change, don't clear
    }
    this.currentBplHome = bplHome;
    this.resolver.setBplHome(bplHome);
    this.clear();
  }

  /**
   * Index a file and all its imports
   * @param filePath Absolute path to the file
   * @param recursive Whether to recursively index imports
   */
  indexFile(filePath: string, recursive = true): void {
    // Check if file needs re-indexing
    if (!this.needsReindex(filePath)) {
      return;
    }

    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const parser = new Parser(content, filePath);
      const program = parser.parse();

      // Clear old symbols for this file
      this.clearFileSymbols(filePath);

      // Index symbols in this file
      this.indexProgram(program, filePath);

      // Update modification time
      const stat = fs.statSync(filePath);
      this.fileModTime.set(filePath, stat.mtimeMs);

      // Recursively index imports
      if (recursive) {
        for (const stmt of program.statements) {
          if (stmt.kind === "Import") {
            const importStmt = stmt as AST.ImportStmt;
            const resolved = this.resolver.resolve(importStmt.source, filePath);
            if (resolved) {
              debugLog(
                `[SymbolIndex] Import "${importStmt.source}" -> ${resolved.filePath} (${resolved.source})`,
              );

              // Index bare function imports (e.g., import sprintf, printf from "bpl-express")
              const bareFunctions = importStmt.items.filter(
                (item) => !item.isType && !item.isWrapped,
              );
              if (bareFunctions.length > 0) {
                debugLog(
                  `[SymbolIndex] Found ${bareFunctions.length} bare function imports: ${bareFunctions.map((f) => f.name).join(", ")}`,
                );
                this.indexBareFunctions(
                  resolved.filePath,
                  bareFunctions.map((f) => f.name),
                  filePath,
                );
              }

              this.indexFile(resolved.filePath, true);
            } else {
              console.warn(
                `[SymbolIndex] Failed to resolve "${importStmt.source}" from ${filePath}`,
              );
            }
          }
        }
      }
    } catch (error) {
      // Silently fail on parse errors
      console.error(`Failed to index ${filePath}:`, error);
    }
  }

  /**
   * Index specific bare functions from an imported module
   * @param sourceFilePath Path to the source module
   * @param functionNames Names of functions to index
   * @param importingFilePath Path of the file doing the import (for module info context)
   */
  private indexBareFunctions(
    sourceFilePath: string,
    functionNames: string[],
    _importingFilePath: string,
  ): void {
    if (!fs.existsSync(sourceFilePath)) {
      console.warn(
        `[SymbolIndex] Source file not found for bare functions: ${sourceFilePath}`,
      );
      return;
    }

    try {
      const content = fs.readFileSync(sourceFilePath, "utf-8");
      const parser = new Parser(content, sourceFilePath);
      const program = parser.parse();

      const moduleInfo = this.getModuleInfo(sourceFilePath);

      // Find and index only the requested functions
      for (const stmt of program.statements) {
        if (stmt.kind === "FunctionDecl" || stmt.kind === "Extern") {
          const name =
            stmt.kind === "FunctionDecl"
              ? (stmt as AST.FunctionDecl).name
              : (stmt as AST.ExternDecl).name;

          if (functionNames.includes(name)) {
            const symbol = this.extractSymbol(stmt, sourceFilePath, moduleInfo);
            if (symbol) {
              debugLog(
                `[SymbolIndex] Indexed bare function "${name}" from ${sourceFilePath}`,
              );
              this.addSymbol(symbol);
            }
          }
        }
      }
    } catch (error) {
      console.error(
        `Failed to index bare functions from ${sourceFilePath}:`,
        error,
      );
    }
  }

  /**
   * Check if a file needs re-indexing
   */
  private needsReindex(filePath: string): boolean {
    if (!fs.existsSync(filePath)) {
      return false;
    }

    const lastModTime = this.fileModTime.get(filePath);
    if (!lastModTime) {
      return true;
    }

    const stat = fs.statSync(filePath);
    return stat.mtimeMs !== lastModTime;
  }

  /**
   * Index all symbols in a program
   */
  private indexProgram(program: AST.Program, filePath: string): void {
    const moduleInfo = this.getModuleInfo(filePath);
    debugLog(
      `[SymbolIndex] Indexing program: ${filePath}, source: ${moduleInfo.source}, package: ${moduleInfo.packageName || "N/A"}`,
    );

    for (const stmt of program.statements) {
      const symbol = this.extractSymbol(stmt, filePath, moduleInfo);
      if (symbol) {
        const methodCount = symbol.methods?.length || 0;
        const fieldCount = symbol.fields?.length || 0;
        debugLog(
          `[SymbolIndex] Added ${symbol.kind} "${symbol.name}" from ${symbol.source} (${methodCount} methods, ${fieldCount} fields)`,
        );
        this.addSymbol(symbol);
      }
    }
  }

  /**
   * Get module info (source type, package name) for a file path
   */
  private getModuleInfo(
    filePath: string,
  ): Pick<SymbolInfo, "source" | "packageName"> {
    // Determine if this is stdlib, local, or package
    if (filePath.includes("/lib/") || filePath.includes("\\lib\\")) {
      // Check if it's under a recognized stdlib path
      if (
        filePath.includes("/lib/std/") ||
        filePath.includes("\\lib\\std\\") ||
        filePath.match(/[\/\\]lib[\/\\][a-z_]+\.bpl$/)
      ) {
        return { source: "stdlib" };
      }
    }

    if (
      filePath.includes("/bpl_modules/") ||
      filePath.includes("\\bpl_modules\\")
    ) {
      // Extract package name
      const match = filePath.match(/bpl_modules[\/\\]([^\/\\]+)/);
      return {
        source: "local-package",
        packageName: match ? match[1] : undefined,
      };
    }

    if (
      filePath.includes("/.bpl/packages/") ||
      filePath.includes("\\.bpl\\packages\\")
    ) {
      // Extract package name
      const match = filePath.match(/packages[\/\\]([^\/\\]+)/);
      let packageName = match ? match[1] : undefined;
      // Remove version suffix (e.g., "mypackage-1.0.0" -> "mypackage")
      if (packageName) {
        packageName = packageName.replace(/-\d+\.\d+\.\d+$/, "");
      }
      return { source: "global-package", packageName };
    }

    return { source: "local" };
  }

  /**
   * Extract symbol information from a declaration
   */
  private extractSymbol(
    stmt: AST.Statement,
    filePath: string,
    moduleInfo: Pick<SymbolInfo, "source" | "packageName">,
  ): SymbolInfo | null {
    if (!stmt.location) return null;

    switch (stmt.kind) {
      case "StructDecl": {
        const structDecl = stmt as AST.StructDecl;
        return {
          name: structDecl.name,
          kind: "struct",
          filePath,
          location: {
            startLine: stmt.location.startLine,
            startColumn: stmt.location.startColumn,
            endLine: stmt.location.endLine,
            endColumn: stmt.location.endColumn,
          },
          declaration: stmt,
          documentation: structDecl.documentation,
          methods: this.extractMethods(structDecl.members),
          fields: this.extractFields(structDecl.members),
          ...moduleInfo,
        };
      }

      case "EnumDecl": {
        const enumDecl = stmt as AST.EnumDecl;
        return {
          name: enumDecl.name,
          kind: "enum",
          filePath,
          location: {
            startLine: stmt.location.startLine,
            startColumn: stmt.location.startColumn,
            endLine: stmt.location.endLine,
            endColumn: stmt.location.endColumn,
          },
          declaration: stmt,
          documentation: enumDecl.documentation,
          methods: this.extractMethods(enumDecl.methods),
          variants: this.extractVariants(enumDecl.variants),
          ...moduleInfo,
        };
      }

      case "FunctionDecl": {
        const funcDecl = stmt as AST.FunctionDecl;
        return {
          name: funcDecl.name,
          kind: "function",
          filePath,
          location: {
            startLine: stmt.location.startLine,
            startColumn: stmt.location.startColumn,
            endLine: stmt.location.endLine,
            endColumn: stmt.location.endColumn,
          },
          declaration: stmt,
          documentation: funcDecl.documentation,
          signature: this.extractFunctionSignature(funcDecl),
          ...moduleInfo,
        };
      }

      case "TypeAlias": {
        const typeAlias = stmt as AST.TypeAliasDecl;
        return {
          name: typeAlias.name,
          kind: "type-alias",
          filePath,
          location: {
            startLine: stmt.location.startLine,
            startColumn: stmt.location.startColumn,
            endLine: stmt.location.endLine,
            endColumn: stmt.location.endColumn,
          },
          declaration: stmt,
          documentation: typeAlias.documentation,
          ...moduleInfo,
        };
      }

      case "VariableDecl": {
        const varDecl = stmt as AST.VariableDecl;
        if (typeof varDecl.name !== "string") return null; // Skip destructuring
        return {
          name: varDecl.name,
          kind: varDecl.isConst ? "constant" : "variable",
          filePath,
          location: {
            startLine: stmt.location.startLine,
            startColumn: stmt.location.startColumn,
            endLine: stmt.location.endLine,
            endColumn: stmt.location.endColumn,
          },
          declaration: stmt,
          ...moduleInfo,
        };
      }

      case "SpecDecl": {
        const specDecl = stmt as AST.SpecDecl;
        return {
          name: specDecl.name,
          kind: "spec",
          filePath,
          location: {
            startLine: stmt.location.startLine,
            startColumn: stmt.location.startColumn,
            endLine: stmt.location.endLine,
            endColumn: stmt.location.endColumn,
          },
          declaration: stmt,
          documentation: specDecl.documentation,
          methods: this.extractSpecMethods(specDecl.methods),
          ...moduleInfo,
        };
      }

      case "Extern": {
        const externDecl = stmt as AST.ExternDecl;
        return {
          name: externDecl.name,
          kind: "function",
          filePath,
          location: {
            startLine: stmt.location.startLine,
            startColumn: stmt.location.startColumn,
            endLine: stmt.location.endLine,
            endColumn: stmt.location.endColumn,
          },
          declaration: stmt,
          signature: {
            parameters: externDecl.params.map((p) => ({
              name: p.name,
              type: this.typeNodeToString(p.type),
            })),
            returnType: externDecl.returnType
              ? this.typeNodeToString(externDecl.returnType)
              : "void",
            isVariadic: externDecl.isVariadic,
          },
          ...moduleInfo,
        };
      }

      default:
        return null;
    }
  }

  /**
   * Extract method information from struct/enum/spec members
   */
  private extractMethods(
    members: (AST.FunctionDecl | AST.StructField)[],
  ): MethodInfo[] {
    const methods: MethodInfo[] = [];

    for (const member of members) {
      if (member.kind === "FunctionDecl") {
        const funcDecl = member as AST.FunctionDecl;
        const isStatic =
          funcDecl.params.length === 0 || funcDecl.params[0]?.name !== "this";

        methods.push({
          name: funcDecl.name,
          isStatic,
          signature: this.extractFunctionSignature(funcDecl),
          documentation: funcDecl.documentation,
          location: funcDecl.location
            ? {
                startLine: funcDecl.location.startLine,
                startColumn: funcDecl.location.startColumn,
                endLine: funcDecl.location.endLine,
                endColumn: funcDecl.location.endColumn,
              }
            : {
                startLine: 0,
                startColumn: 0,
                endLine: 0,
                endColumn: 0,
              },
        });
      }
    }

    return methods;
  }

  /**
   * Extract method information from spec method signatures
   */
  private extractSpecMethods(methods: AST.SpecMethod[]): MethodInfo[] {
    const methodInfos: MethodInfo[] = [];

    for (const method of methods) {
      const parameters = method.params.map((p) => ({
        name: p.name,
        type: this.typeNodeToString(p.type),
      }));
      const returnType = method.returnType
        ? this.typeNodeToString(method.returnType)
        : "void";

      methodInfos.push({
        name: method.name,
        signature: {
          parameters,
          returnType,
        },
        isStatic: false,
        documentation: method.documentation,
        location: method.location
          ? {
              startLine: method.location.startLine,
              startColumn: method.location.startColumn,
              endLine: method.location.endLine,
              endColumn: method.location.endColumn,
            }
          : {
              startLine: 0,
              startColumn: 0,
              endLine: 0,
              endColumn: 0,
            },
      });
    }

    return methodInfos;
  }

  /**
   * Extract field information from struct members
   */
  private extractFields(
    members: (AST.FunctionDecl | AST.StructField)[],
  ): FieldInfo[] {
    const fields: FieldInfo[] = [];

    for (const member of members) {
      if (member.kind === "StructField") {
        const field = member as AST.StructField;
        fields.push({
          name: field.name,
          type: this.typeNodeToString(field.type),
        });
      }
    }

    return fields;
  }

  /**
   * Extract variant information from enum
   */
  private extractVariants(variants: AST.EnumVariant[]): VariantInfo[] {
    return variants.map((v) => ({
      name: v.name,
      dataType: v.dataType ? this.formatVariantDataType(v.dataType) : undefined,
    }));
  }

  /**
   * Format enum variant data type
   */
  private formatVariantDataType(dataType: AST.EnumVariantData): string {
    if (dataType.kind === "EnumVariantTuple") {
      return `(${dataType.types.map((t) => this.typeNodeToString(t)).join(", ")})`;
    } else if (dataType.kind === "EnumVariantStruct") {
      return `{ ${dataType.fields.map((f) => `${f.name}: ${this.typeNodeToString(f.type)}`).join(", ")} }`;
    }
    return "unknown";
  }

  /**
   * Extract function signature
   */
  private extractFunctionSignature(
    funcDecl: AST.FunctionDecl,
  ): FunctionSignature {
    return {
      parameters: funcDecl.params.map((p) => ({
        name: p.name,
        type: this.typeNodeToString(p.type),
        isVariadic: p.isVariadic,
      })),
      returnType: this.typeNodeToString(funcDecl.returnType),
    };
  }

  /**
   * Convert type node to string
   */
  private typeNodeToString(type: AST.TypeNode | undefined): string {
    if (!type) return "void";

    switch (type.kind) {
      case "BasicType": {
        let name = type.name;
        if (type.genericArgs && type.genericArgs.length > 0) {
          name += `<${type.genericArgs.map((t) => this.typeNodeToString(t)).join(", ")}>`;
        }
        if (type.arrayDimensions) {
          for (const dim of type.arrayDimensions) {
            name += `[${dim !== null ? dim : ""}]`;
          }
        }
        if (type.pointerDepth) {
          name = "*".repeat(type.pointerDepth) + name;
        }
        return name;
      }
      case "FunctionType": {
        const params = type.paramTypes
          .map((t) => this.typeNodeToString(t))
          .join(", ");
        const ret = this.typeNodeToString(type.returnType);
        return `Func<${ret}>(${params})`;
      }
      case "TupleType": {
        return `(${type.types.map((t) => this.typeNodeToString(t)).join(", ")})`;
      }
      default:
        return "unknown";
    }
  }

  /**
   * Add a symbol to the index
   */
  private addSymbol(symbol: SymbolInfo): void {
    const existing = this.symbols.get(symbol.name) || [];
    existing.push(symbol);
    this.symbols.set(symbol.name, existing);

    // Track symbols by file
    const fileSyms = this.fileSymbols.get(symbol.filePath) || new Set();
    fileSyms.add(symbol.name);
    this.fileSymbols.set(symbol.filePath, fileSyms);
  }

  /**
   * Clear symbols for a specific file
   */
  private clearFileSymbols(filePath: string): void {
    const fileSyms = this.fileSymbols.get(filePath);
    if (!fileSyms) return;

    for (const name of fileSyms) {
      const symbols = this.symbols.get(name);
      if (symbols) {
        const filtered = symbols.filter((s) => s.filePath !== filePath);
        if (filtered.length === 0) {
          this.symbols.delete(name);
        } else {
          this.symbols.set(name, filtered);
        }
      }
    }

    this.fileSymbols.delete(filePath);
  }

  /**
   * Find symbols by name
   */
  findSymbol(name: string): SymbolInfo[] {
    const results = this.symbols.get(name) || [];
    if (results.length === 0) {
      debugLog(
        `[SymbolIndex.findSymbol] Symbol "${name}" not found. Total symbols in index: ${this.symbols.size}`,
      );
    }
    return results;
  }

  /**
   * Get all symbols in a file
   */
  getFileSymbols(filePath: string): SymbolInfo[] {
    const symbolNames = this.fileSymbols.get(filePath);
    if (!symbolNames) return [];

    const symbols: SymbolInfo[] = [];
    for (const name of symbolNames) {
      const found = this.symbols.get(name) || [];
      symbols.push(...found.filter((s) => s.filePath === filePath));
    }

    return symbols;
  }

  /**
   * Get the module resolver
   */
  getResolver(): ModuleResolver {
    return this.resolver;
  }

  /**
   * Clear the entire index
   */
  clear(): void {
    this.symbols.clear();
    this.fileSymbols.clear();
    this.fileModTime.clear();
  }

  /**
   * Resolve module and get its symbols
   */
  resolveAndIndex(importPath: string, currentFilePath: string): SymbolInfo[] {
    const resolved = this.resolver.resolve(importPath, currentFilePath);
    if (!resolved) return [];

    this.indexFile(resolved.filePath, false); // Don't recursively index
    return this.getFileSymbols(resolved.filePath);
  }

  /**
   * Get all symbols from the index
   */
  getAllSymbols(): SymbolInfo[] {
    const allSymbols: SymbolInfo[] = [];
    for (const symbols of this.symbols.values()) {
      allSymbols.push(...symbols);
    }
    return allSymbols;
  }

  /**
   * Get all symbols imported by a specific file from content string
   */
  getImportedSymbolsFromContent(
    filePath: string,
    content: string,
  ): SymbolInfo[] {
    const importedSymbols: SymbolInfo[] = [];
    const _seenFiles = new Set<string>();
    let importStatements: Array<{
      source: string;
      items?: Array<{ name: string }>;
    }> = [];

    try {
      const parser = new Parser(content, filePath);
      const program = parser.parse();

      importStatements = program.statements.filter(
        (stmt): stmt is AST.ImportStmt => stmt.kind === "Import",
      );
    } catch {
      importStatements = this.extractImportsFromContent(content);
    }

    try {
      debugLog(
        `[SymbolIndex] Getting imported symbols from content for ${filePath}`,
      );

      for (const importStmt of importStatements) {
        debugLog(
          `[SymbolIndex] Found import: ${importStmt.source}, items: ${importStmt.items?.length || 0}`,
        );

        const resolved = this.resolver.resolve(importStmt.source, filePath);

        if (resolved) {
          debugLog(`[SymbolIndex] Resolved to: ${resolved.filePath}`);

          // Index the imported file if not already indexed
          this.indexFile(resolved.filePath, true);

          // Get symbols from the imported file
          const importedFileSymbols = this.getFileSymbols(resolved.filePath);
          debugLog(
            `[SymbolIndex] Found ${importedFileSymbols.length} symbols in imported file`,
          );

          // Filter based on what was imported
          if (importStmt.items && importStmt.items.length > 0) {
            // Specific imports: import [Foo, bar] from "module" OR import foo, bar from "module"
            const importedNames = new Set(
              importStmt.items.map((item) => item.name),
            );
            debugLog(
              `[SymbolIndex] Importing specific items: ${Array.from(importedNames).join(", ")}`,
            );

            // First try to find from the file itself
            const filtered = importedFileSymbols.filter((sym) =>
              importedNames.has(sym.name),
            );
            debugLog(
              `[SymbolIndex] Matched ${filtered.length} symbols from file`,
            );

            // If not found in file, search globally by name (for re-exports)
            const notFound = Array.from(importedNames).filter(
              (name) => !filtered.some((s) => s.name === name),
            );

            if (notFound.length > 0) {
              debugLog(
                `[SymbolIndex] Searching globally for: ${notFound.join(", ")}`,
              );
              for (const name of notFound) {
                const globalSymbols = this.symbols.get(name) || [];
                // Add all symbols with this name (could be from different files)
                filtered.push(...globalSymbols);
                debugLog(
                  `[SymbolIndex] Found ${globalSymbols.length} global symbols for "${name}"`,
                );
              }
            }

            importedSymbols.push(...filtered);
          } else {
            // Import all: import * from "module"
            debugLog(`[SymbolIndex] Import all (*)`);
            importedSymbols.push(...importedFileSymbols);
          }
        } else {
          console.warn(
            `[SymbolIndex] Failed to resolve import: ${importStmt.source}`,
          );
        }
      }

      debugLog(
        `[SymbolIndex] Total imported symbols: ${importedSymbols.length}`,
      );
    } catch (error) {
      console.error(`Failed to get imported symbols:`, error);
    }

    return importedSymbols;
  }

  private extractImportsFromContent(
    content: string,
  ): Array<{ source: string; items?: Array<{ name: string }> }> {
    const imports: Array<{ source: string; items?: Array<{ name: string }> }> =
      [];
    const importRegex = /\bimport\s+([\s\S]*?)\s+from\s+["']([^"']+)["']\s*;/g;

    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(content)) !== null) {
      const importList = match[1]?.trim() || "";
      const source = match[2];
      if (!source) continue;

      if (importList === "*") {
        imports.push({ source });
        continue;
      }

      const names = importList
        .replace(/[\[\]]/g, "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => item.split(/\s+as\s+|\s+/)[0])
        .filter((name): name is string => Boolean(name))
        .map((name) => ({ name }));

      imports.push({
        source,
        items: names.length > 0 ? names : undefined,
      });
    }

    return imports;
  }

  /**
   * Get all symbols imported by a specific file
   */
  getImportedSymbols(filePath: string): SymbolInfo[] {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      return this.getImportedSymbolsFromContent(filePath, content);
    } catch (error) {
      console.error(`Failed to get imported symbols for ${filePath}:`, error);
      return [];
    }
  }

  /**
   * Get symbols from a file and all its imports recursively
   */
  private getFileSymbolsRecursive(
    filePath: string,
    seenFiles: Set<string>,
  ): SymbolInfo[] {
    if (seenFiles.has(filePath)) {
      return [];
    }
    seenFiles.add(filePath);

    const symbols: SymbolInfo[] = [];

    // Get direct symbols from this file
    const directSymbols = this.getFileSymbols(filePath);
    symbols.push(...directSymbols);

    // Get symbols from files that this file imports
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const parser = new Parser(content, filePath);
      const program = parser.parse();

      for (const stmt of program.statements) {
        if (stmt.kind === "Import") {
          const importStmt = stmt as AST.ImportStmt;
          const resolved = this.resolver.resolve(importStmt.source, filePath);

          if (resolved) {
            // Recursively get symbols from imported file
            const transitiveSymbols = this.getFileSymbolsRecursive(
              resolved.filePath,
              seenFiles,
            );

            // If specific items are imported, filter them
            if (importStmt.items && importStmt.items.length > 0) {
              const importedNames = new Set(
                importStmt.items.map((item) => item.name),
              );
              symbols.push(
                ...transitiveSymbols.filter((sym) =>
                  importedNames.has(sym.name),
                ),
              );
            } else {
              // Import all
              symbols.push(...transitiveSymbols);
            }
          }
        }
      }
    } catch (_error) {
      // Ignore parse errors
    }

    return symbols;
  }
}
