/**
 * Linker Symbol Table
 *
 * Tracks all symbols that need to be linked at compile/link time.
 * Manages:
 * - External function declarations (FFI)
 * - Exported symbols from modules
 * - Link-time symbol verification
 * - Object file symbol resolution
 */

import * as AST from "../common/AST";
import { CompilerError } from "../common/CompilerError";

export interface SymbolInfo {
  /** Symbol name */
  name: string;

  /** Symbol kind: "function", "variable", "type" */
  kind: "function" | "variable" | "type";

  /** Module where symbol is defined */
  module: string;

  /** Whether symbol is exported */
  isExported: boolean;

  /** Type signature for functions */
  type?: AST.TypeNode;

  /** AST node for the symbol */
  declaration?: AST.ASTNode;

  /** Whether this is an extern declaration */
  isExtern?: boolean;

  /** Source location for error reporting */
  location?: any;

  /** Overloaded definitions for functions */
  overloads?: SymbolInfo[];
}

export interface ObjectFileSymbol {
  name: string;
  type: "function" | "variable" | "undefined" | "object";
  isGlobal: boolean;
}

export class LinkerSymbolTable {
  /** All defined symbols: name -> SymbolInfo */
  private symbols: Map<string, SymbolInfo> = new Map();

  /** Undefined symbol references: name -> locations where referenced */
  private undefinedReferences: Map<string, any[]> = new Map();

  /** Object file symbols for linking */
  private objectFileSymbols: Map<string, ObjectFileSymbol[]> = new Map();

  /**
   * Define a symbol in the linker symbol table
   */
  defineSymbol(info: SymbolInfo): void {
    const key = `${info.module}:${info.name}`;
    const existing = this.symbols.get(key);

    if (existing) {
      if (
        existing.kind === "function" &&
        info.kind === "function" &&
        !existing.isExtern &&
        !info.isExtern
      ) {
        if (!existing.overloads) {
          existing.overloads = [];
        }
        existing.overloads.push(info);
        return;
      }

      if (!existing.isExtern && !info.isExtern) {
        throw new Error(
          `Duplicate symbol definition: ${info.name} in module ${info.module}`,
        );
      }
    }

    this.symbols.set(key, info);
  }

  /**
   * Reference a symbol (may be undefined)
   */
  referenceSymbol(name: string, location?: any): void {
    if (!this.symbols.has(name)) {
      if (!this.undefinedReferences.has(name)) {
        this.undefinedReferences.set(name, []);
      }
      this.undefinedReferences.get(name)!.push(location);
    }
  }

  /**
   * Get symbol information
   */
  getSymbol(name: string): SymbolInfo | undefined {
    for (const [, info] of this.symbols) {
      if (info.name === name) {
        return info;
      }
    }
    return undefined;
  }

  /**
   * Check if symbol is defined
   */
  hasSymbol(name: string): boolean {
    for (const [, info] of this.symbols) {
      if (info.name === name) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get all undefined symbol references
   */
  getUndefinedSymbols(): string[] {
    return Array.from(this.undefinedReferences.keys());
  }

  /**
   * Verify all referenced symbols are available
   */
  verifySymbols(): CompilerError[] {
    const errors: CompilerError[] = [];

    for (const [name, locations] of this.undefinedReferences.entries()) {
      if (!this.symbols.has(name)) {
        const location = locations[0];
        errors.push(
          new CompilerError(
            `Undefined symbol: ${name}`,
            `Symbol '${name}' is referenced but not defined. ` +
              `Did you mean to import it from a module or declare it with 'extern'?`,
            location,
          ),
        );
      }
    }

    return errors;
  }

  /**
   * Register symbols from an object file
   */
  registerObjectFile(objectPath: string, symbols: ObjectFileSymbol[]): void {
    this.objectFileSymbols.set(objectPath, symbols);

    // Mark symbols as available from this object file
    for (const sym of symbols) {
      if (sym.isGlobal && !this.hasSymbol(sym.name)) {
        this.symbols.set(`${objectPath}:${sym.name}`, {
          name: sym.name,
          kind: sym.type === "function" ? "function" : "variable",
          module: objectPath,
          isExported: true,
          isExtern: true,
        });
      }
    }
  }

  /**
   * Get symbols from an object file
   */
  getObjectFileSymbols(objectPath: string): ObjectFileSymbol[] | undefined {
    return this.objectFileSymbols.get(objectPath);
  }

  /**
   * Export a symbol from a module
   */
  exportSymbol(name: string, module: string): void {
    for (const [, info] of this.symbols) {
      if (info.name === name && info.module === module) {
        info.isExported = true;
        return;
      }
    }
  }

  /**
   * Get all exported symbols from a module
   */
  getExportedSymbols(module: string): SymbolInfo[] {
    return Array.from(this.symbols.values()).filter(
      (s) => s.module === module && s.isExported,
    );
  }

  /**
   * Clear all symbols (for new compilation)
   */
  clear(): void {
    this.symbols.clear();
    this.undefinedReferences.clear();
    this.objectFileSymbols.clear();
  }

  /**
   * Get all symbols
   */
  getAllSymbols(): SymbolInfo[] {
    return Array.from(this.symbols.values());
  }
}
