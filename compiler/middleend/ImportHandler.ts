/**
 * Import and module handling for the BPL type checker
 * Handles import resolution, module loading, and symbol importing
 */

import * as fs from "fs";
import * as path from "path";

import * as AST from "../common/AST";
import { CompilerError, type SourceLocation } from "../common/CompilerError";

import { lexWithGrammar } from "../frontend/GrammarLexer";
import { Parser } from "../frontend/Parser";
import { type Symbol, type SymbolKind, SymbolTable } from "./SymbolTable";
import { initializeBuiltinsInScope } from "./BuiltinTypes";
import { getLibPath } from "../common/PathResolver";
import { ModuleResolver } from "./ModuleResolver";

/**
 * Import handler context
 */
export interface ImportHandlerContext {
  modules: Map<string, SymbolTable>;
  preLoadedModules: Map<string, AST.Program>;
  skipImportResolution: boolean;
  currentScope: SymbolTable;
  globalScope: SymbolTable;
  hoistDeclaration: (stmt: AST.Statement) => void;
  checkStatement: (stmt: AST.Statement) => void;
  defineSymbol: (
    name: string,
    kind: SymbolKind,
    type: AST.TypeNode | undefined,
    declaration: AST.ASTNode,
    moduleScope?: SymbolTable,
  ) => void;
}

/**
 * Handles import statement processing
 */
export class ImportHandler {
  private ctx: ImportHandlerContext;

  constructor(context: ImportHandlerContext) {
    this.ctx = context;
  }

  /**
   * Define an imported symbol in the current scope
   */
  defineImportedSymbol(
    name: string,
    symbol: Symbol,
    scope?: SymbolTable,
  ): void {
    // Define primary symbol
    if (scope) {
      scope.define({
        name,
        kind: symbol.kind,
        type: symbol.type,
        declaration: symbol.declaration,
        moduleScope: symbol.moduleScope,
      });
    } else {
      this.ctx.defineSymbol(
        name,
        symbol.kind,
        symbol.type,
        symbol.declaration!,
        symbol.moduleScope,
      );
    }

    // Define overloads
    if (symbol.overloads) {
      for (const overload of symbol.overloads) {
        if (scope) {
          scope.define({
            name,
            kind: overload.kind,
            type: overload.type,
            declaration: overload.declaration,
            moduleScope: overload.moduleScope,
          });
        } else {
          this.ctx.defineSymbol(
            name,
            overload.kind,
            overload.type,
            overload.declaration!,
            overload.moduleScope,
          );
        }
      }
    }
  }

  /**
   * Resolve the import path from an import statement
   */
  private resolveImportPath(stmt: AST.ImportStmt): {
    importPath: string;
    ast?: AST.Program;
  } {
    const currentFile = stmt.location.file;
    let importPath: string | undefined;
    let ast: AST.Program | undefined;

    // Always use ModuleResolver to get the canonical path
    const moduleResolver = new ModuleResolver();
    try {
      importPath = moduleResolver.resolveModulePath(stmt.source, currentFile);
    } catch (_e) {
      // Ignore error, will handle below
    }

    if (this.ctx.skipImportResolution) {
      // Try to find AST in pre-loaded modules using the resolved path
      if (importPath && this.ctx.preLoadedModules.has(importPath)) {
        ast = this.ctx.preLoadedModules.get(importPath);
      } else {
        // Fallback to heuristic if ModuleResolver failed or path not in preLoadedModules
        for (const [modulePath, moduleAst] of this.ctx.preLoadedModules) {
          if (
            modulePath.includes(stmt.source) ||
            modulePath.includes(stmt.source.replace(/^[./]+/, ""))
          ) {
            importPath = modulePath;
            ast = moduleAst;
            break;
          }
        }
      }

      if (!importPath) {
        throw new CompilerError(
          `Module not found: ${stmt.source}`,
          "Module resolution failed",
          stmt.location,
        );
      }
    } else if (!importPath) {
      // If not skipping, use the resolved path or fallback to simple resolution
      if (stmt.source === "std") {
        const stdLibPath = getLibPath();
        importPath = path.join(stdLibPath, "std.bpl");
      } else if (stmt.source.startsWith("std/")) {
        const stdLibPath = getLibPath();
        const relativePath = stmt.source.substring(4);
        importPath = path.join(stdLibPath, relativePath);
      } else {
        const currentDir = path.dirname(currentFile);
        importPath = path.resolve(currentDir, stmt.source);
      }
    }

    return { importPath: importPath!, ast };
  }

  /**
   * Load a module and get its symbol table
   */
  private loadModule(
    importPath: string,
    ast: AST.Program | undefined,
    location: SourceLocation,
  ): SymbolTable {
    const existingScope = this.ctx.modules.get(importPath);

    if (existingScope) {
      return existingScope;
    }

    // Load module if not already available
    let moduleAst = ast;
    if (!moduleAst) {
      if (!fs.existsSync(importPath)) {
        throw new CompilerError(
          `Module not found: ${importPath}`,
          "Ensure the file exists and the path is correct.",
          location,
        );
      }

      const content = fs.readFileSync(importPath, "utf-8");
      const tokens = lexWithGrammar(content, importPath);
      const parser = new Parser(content, importPath, tokens);
      moduleAst = parser.parse(true);
      this.ctx.preLoadedModules.set(importPath, moduleAst);
    }

    const moduleScope = new SymbolTable();
    this.ctx.modules.set(importPath, moduleScope);
    initializeBuiltinsInScope(moduleScope);

    // Context switch
    const prevGlobal = this.ctx.globalScope;
    const prevCurrent = this.ctx.currentScope;

    // Temporarily switch scopes
    this.ctx.globalScope = moduleScope;
    this.ctx.currentScope = moduleScope;

    // Hoist declarations in the imported module
    for (const s of moduleAst.statements) {
      this.ctx.hoistDeclaration(s);
    }

    // Check statements (Pass 2) to resolve methods in structs
    // This ensures that methods in implicitly loaded modules have their resolvedType set
    for (const s of moduleAst.statements) {
      this.ctx.checkStatement(s);
    }

    // Restore context
    this.ctx.globalScope = prevGlobal;
    this.ctx.currentScope = prevCurrent;

    return moduleScope;
  }

  /**
   * Process an import statement
   */
  checkImport(stmt: AST.ImportStmt): void {
    const { importPath, ast } = this.resolveImportPath(stmt);
    const moduleScope = this.loadModule(importPath, ast, stmt.location);

    // Get AST for export checking
    let moduleAst = ast;
    if (!moduleAst) {
      moduleAst = this.ctx.preLoadedModules.get(importPath);
    }

    // Import items
    if (stmt.namespace) {
      // Import as namespace
      this.importAsNamespace(stmt, moduleScope, moduleAst, importPath);
    } else if (stmt.importAll) {
      // Import all exported symbols
      this.importAllSymbols(stmt, moduleScope, moduleAst, importPath);
    }

    // Import specific items
    for (const item of stmt.items) {
      this.importItem(item, stmt, moduleScope, moduleAst);
    }
  }

  /**
   * Load implicit imports (primitives) into the global scope
   */
  public loadImplicitImports(): void {
    const stdLibPath = getLibPath();
    const primitivesPath = path.join(stdLibPath, "primitives.bpl");

    // Check if file exists to avoid crashing if stdlib is missing
    if (!fs.existsSync(primitivesPath)) {
      return;
    }

    const location: SourceLocation = {
      file: "internal",
      startLine: 0,
      startColumn: 0,
      endLine: 0,
      endColumn: 0,
    };

    try {
      const moduleScope = this.loadModule(primitivesPath, undefined, location);

      // Export specific symbols to global scope
      const symbolsToExport = [
        "Int",
        "Bool",
        "Double",
        "Long",
        "Char",
        "UChar",
        "Short",
        "UShort",
        "UInt",
        "ULong",
      ];
      for (const name of symbolsToExport) {
        const symbol = moduleScope.resolve(name);
        if (symbol) {
          this.defineImportedSymbol(name, symbol, this.ctx.globalScope);
        }
      }
    } catch (_e) {
      // Ignore errors loading implicit primitives
    }
  }

  /**
   * Import a module as a namespace
   */
  private importAsNamespace(
    stmt: AST.ImportStmt,
    moduleScope: SymbolTable,
    ast: AST.Program | undefined,
    importPath: string,
  ): void {
    // Create a restricted scope that only contains exported items
    const exportedScope = new SymbolTable();

    if (ast) {
      for (const s of ast.statements) {
        if (s.kind === "Export") {
          const exportStmt = s as AST.ExportStmt;
          for (const item of exportStmt.items) {
            const symbol = moduleScope.resolve(item.name);
            if (symbol) {
              this.defineImportedSymbol(symbol.name, symbol, exportedScope);
            }
          }
        }
      }
    } else if (this.ctx.skipImportResolution) {
      // Try to find AST from preLoadedModules
      const moduleAst = this.ctx.preLoadedModules.get(importPath);
      if (moduleAst) {
        for (const s of moduleAst.statements) {
          if (s.kind === "Export") {
            const exportStmt = s as AST.ExportStmt;
            for (const item of exportStmt.items) {
              const symbol = moduleScope.resolve(item.name);
              if (symbol) {
                exportedScope.define({
                  name: symbol.name,
                  kind: symbol.kind,
                  type: symbol.type,
                  declaration: symbol.declaration,
                  moduleScope: symbol.moduleScope,
                });
              }
            }
          }
        }
      }
    }

    this.ctx.defineSymbol(
      stmt.namespace!,
      "Module",
      {
        kind: "ModuleType",
        name: stmt.namespace!,
        moduleScope: exportedScope,
        location: stmt.location,
      } as any,
      stmt,
      exportedScope,
    );
  }

  /**
   * Import all exported symbols from a module
   */
  private importAllSymbols(
    stmt: AST.ImportStmt,
    moduleScope: SymbolTable,
    ast: AST.Program | undefined,
    importPath: string,
  ): void {
    let moduleAst = ast;

    // If AST is not available, try to get from preLoadedModules
    if (!moduleAst && this.ctx.skipImportResolution) {
      moduleAst = this.ctx.preLoadedModules.get(importPath);
    }

    if (moduleAst) {
      for (const s of moduleAst.statements) {
        if (s.kind === "Export") {
          const exportStmt = s as AST.ExportStmt;
          for (const item of exportStmt.items) {
            const symbol = moduleScope.resolve(item.name);
            if (symbol) {
              this.defineImportedSymbol(symbol.name, symbol);
            }
          }
        }
      }
    }
  }

  /**
   * Import a specific item from a module
   */
  private importItem(
    item: { name: string; alias?: string },
    stmt: AST.ImportStmt,
    moduleScope: SymbolTable,
    ast: AST.Program | undefined,
  ): void {
    // Check if the item is exported by looking at ExportStmt nodes in AST
    let isExported = false;
    let exportedSymbol: Symbol | undefined;

    if (ast) {
      for (const s of ast.statements) {
        if (s.kind === "Export") {
          const exportStmt = s as AST.ExportStmt;
          for (const exportedItem of exportStmt.items) {
            if (exportedItem.name === item.name) {
              isExported = true;
              exportedSymbol = moduleScope.resolve(item.name);
              break;
            }
          }
          if (isExported) break;
        }
      }
    }

    if (!isExported || !exportedSymbol) {
      throw new CompilerError(
        `Module '${stmt.source}' does not export '${item.name}'`,
        "Ensure the symbol is exported (or defined) in the module.",
        stmt.location,
      );
    }

    // Define in current scope
    this.defineImportedSymbol(item.alias || item.name, exportedSymbol);
  }
}
