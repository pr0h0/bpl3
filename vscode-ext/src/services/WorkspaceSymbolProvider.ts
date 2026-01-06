import {
  Range,
  SymbolKind,
  WorkspaceSymbol,
  type WorkspaceSymbolParams,
} from "vscode-languageserver/node";
import * as AST from "../../../compiler/common/AST";
import { ASTResolver } from "./ASTResolver";
import { SymbolIndex } from "./SymbolIndex";

/**
 * Provides workspace-wide symbol search (Ctrl+T)
 */
export class WorkspaceSymbolProvider {
  constructor(
    private astResolver: ASTResolver,
    private symbolIndex: SymbolIndex,
  ) {}

  /**
   * Search for symbols across the entire workspace
   */
  async search(params: WorkspaceSymbolParams): Promise<WorkspaceSymbol[]> {
    const query = params.query.toLowerCase();
    const results: WorkspaceSymbol[] = [];

    // If query is empty, return top-level symbols
    if (!query) {
      return this.getTopLevelSymbols();
    }

    // Search in symbol index first (faster)
    const indexResults = this.searchInSymbolIndex(query);
    results.push(...indexResults);

    // Also search in all cached ASTs for complete coverage
    const astResults = this.searchInAllASTs(query);
    results.push(...astResults);

    // Deduplicate by name+location
    return this.deduplicateResults(results);
  }

  /**
   * Get top-level symbols when no query is provided
   */
  private getTopLevelSymbols(): WorkspaceSymbol[] {
    const symbols: WorkspaceSymbol[] = [];
    const allFiles = this.astResolver.getAllCachedFiles();

    for (const filePath of allFiles) {
      const ast = this.astResolver.getCachedAST(filePath);
      if (!ast) continue;

      for (const stmt of ast.statements) {
        const symbol = this.statementToWorkspaceSymbol(stmt, filePath);
        if (symbol) {
          symbols.push(symbol);
        }
      }
    }

    return symbols.slice(0, 100); // Limit to 100 for performance
  }

  /**
   * Search in the symbol index
   */
  private searchInSymbolIndex(query: string): WorkspaceSymbol[] {
    const results: WorkspaceSymbol[] = [];

    // Get all symbols from the index
    const allSymbols = this.symbolIndex.getAllSymbols();

    for (const [name, symbol] of Object.entries(allSymbols)) {
      if (name.toLowerCase().includes(query)) {
        const location = symbol.location;
        if (!location) continue;

        const range = Range.create(
          location.startLine - 1,
          location.startColumn - 1,
          location.endLine - 1,
          location.endColumn - 1,
        );

        results.push({
          name: name,
          kind: this.symbolKindFromType(symbol.kind),
          location: {
            uri: `file://${symbol.filePath}`,
            range: range,
          },
        });
      }
    }

    return results;
  }

  /**
   * Search in all cached ASTs
   */
  private searchInAllASTs(query: string): WorkspaceSymbol[] {
    const results: WorkspaceSymbol[] = [];
    const allFiles = this.astResolver.getAllCachedFiles();

    for (const filePath of allFiles) {
      const ast = this.astResolver.getCachedAST(filePath);
      if (!ast) continue;

      // Search in top-level statements
      for (const stmt of ast.statements) {
        this.searchInStatement(stmt, query, filePath, results);
      }
    }

    return results;
  }

  /**
   * Search recursively in a statement
   */
  private searchInStatement(
    stmt: AST.Statement,
    query: string,
    filePath: string,
    results: WorkspaceSymbol[],
  ) {
    switch (stmt.kind) {
      case "FunctionDecl":
        const func = stmt as AST.FunctionDecl;
        if (func.name.toLowerCase().includes(query)) {
          const symbol = this.statementToWorkspaceSymbol(stmt, filePath);
          if (symbol) results.push(symbol);
        }
        // Search in function body for local variables
        if (func.body) {
          for (const s of func.body.statements) {
            if (s.kind === "VariableDecl") {
              const varDecl = s as AST.VariableDecl;
              if (
                typeof varDecl.name === "string" &&
                varDecl.name.toLowerCase().includes(query)
              ) {
                const symbol = this.statementToWorkspaceSymbol(s, filePath);
                if (symbol) results.push(symbol);
              }
            }
          }
        }
        break;

      case "StructDecl":
        const struct = stmt as AST.StructDecl;
        if (struct.name.toLowerCase().includes(query)) {
          const symbol = this.statementToWorkspaceSymbol(stmt, filePath);
          if (symbol) results.push(symbol);
        }
        // Search in struct members (methods and fields)
        for (const member of struct.members) {
          if (member.kind === "FunctionDecl") {
            const method = member as AST.FunctionDecl;
            if (
              method.name &&
              typeof method.name === "string" &&
              method.name.toLowerCase().includes(query)
            ) {
              const methodSymbol = this.createMethodSymbol(
                method,
                struct.name,
                filePath,
              );
              if (methodSymbol) results.push(methodSymbol);
            }
          } else if (member.kind === "StructField") {
            const field = member as AST.StructField;
            if (field.name.toLowerCase().includes(query)) {
              const fieldSymbol = this.createFieldSymbol(
                field,
                struct.name,
                filePath,
              );
              if (fieldSymbol) results.push(fieldSymbol);
            }
          }
        }
        break;

      case "EnumDecl":
        const enumDecl = stmt as AST.EnumDecl;
        if (enumDecl.name.toLowerCase().includes(query)) {
          const symbol = this.statementToWorkspaceSymbol(stmt, filePath);
          if (symbol) results.push(symbol);
        }
        // Search in enum variants
        for (const variant of enumDecl.variants) {
          if (variant.name.toLowerCase().includes(query)) {
            const variantSymbol = this.createEnumVariantSymbol(
              variant,
              enumDecl.name,
              filePath,
            );
            if (variantSymbol) results.push(variantSymbol);
          }
        }
        break;

      case "TypeAlias":
        const typeAlias = stmt as AST.TypeAliasDecl;
        if (typeAlias.name.toLowerCase().includes(query)) {
          const symbol = this.statementToWorkspaceSymbol(stmt, filePath);
          if (symbol) results.push(symbol);
        }
        break;

      case "VariableDecl":
        const varDecl = stmt as AST.VariableDecl;
        if (
          typeof varDecl.name === "string" &&
          varDecl.name.toLowerCase().includes(query)
        ) {
          const symbol = this.statementToWorkspaceSymbol(stmt, filePath);
          if (symbol) results.push(symbol);
        }
        break;
    }
  }

  /**
   * Convert statement to workspace symbol
   */
  private statementToWorkspaceSymbol(
    stmt: AST.Statement,
    filePath: string,
  ): WorkspaceSymbol | null {
    if (!stmt.location) return null;

    const range = this.nodeToRange(stmt);
    if (!range) return null;

    let name = "";
    let kind: SymbolKind = SymbolKind.Variable;

    switch (stmt.kind) {
      case "FunctionDecl":
        name = (stmt as AST.FunctionDecl).name;
        kind = SymbolKind.Function;
        break;
      case "StructDecl":
        name = (stmt as AST.StructDecl).name;
        kind = SymbolKind.Class;
        break;
      case "EnumDecl":
        name = (stmt as AST.EnumDecl).name;
        kind = SymbolKind.Enum;
        break;
      case "TypeAlias":
        name = (stmt as AST.TypeAliasDecl).name;
        kind = SymbolKind.TypeParameter;
        break;
      case "VariableDecl":
        const varDecl = stmt as AST.VariableDecl;
        name = typeof varDecl.name === "string" ? varDecl.name : "";
        kind = varDecl.isGlobal ? SymbolKind.Constant : SymbolKind.Variable;
        break;
      default:
        return null;
    }

    return {
      name: name,
      kind: kind,
      location: {
        uri: `file://${filePath}`,
        range: range,
      },
    };
  }

  /**
   * Create method symbol
   */
  private createMethodSymbol(
    method: AST.FunctionDecl,
    structName: string,
    filePath: string,
  ): WorkspaceSymbol | null {
    const range = this.nodeToRange(method);
    if (!range) return null;

    return {
      name: `${structName}.${method.name}`,
      kind: SymbolKind.Method,
      location: {
        uri: `file://${filePath}`,
        range: range,
      },
      containerName: structName,
    };
  }

  /**
   * Create field symbol
   */
  private createFieldSymbol(
    field: AST.StructField,
    structName: string,
    filePath: string,
  ): WorkspaceSymbol | null {
    const range = this.nodeToRange(field);
    if (!range) return null;

    return {
      name: `${structName}.${field.name}`,
      kind: SymbolKind.Field,
      location: {
        uri: `file://${filePath}`,
        range: range,
      },
      containerName: structName,
    };
  }

  /**
   * Create enum variant symbol
   */
  private createEnumVariantSymbol(
    variant: AST.EnumVariant,
    enumName: string,
    filePath: string,
  ): WorkspaceSymbol | null {
    const range = this.nodeToRange(variant);
    if (!range) return null;

    return {
      name: `${enumName}.${variant.name}`,
      kind: SymbolKind.EnumMember,
      location: {
        uri: `file://${filePath}`,
        range: range,
      },
      containerName: enumName,
    };
  }

  /**
   * Deduplicate results by name and location
   */
  private deduplicateResults(results: WorkspaceSymbol[]): WorkspaceSymbol[] {
    const seen = new Set<string>();
    const deduplicated: WorkspaceSymbol[] = [];

    for (const result of results) {
      // Handle both Location and LocationLink types
      const line =
        "range" in result.location ? result.location.range.start.line : 0;
      const key = `${result.name}:${result.location.uri}:${line}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(result);
      }
    }

    return deduplicated.slice(0, 200); // Limit results for performance
  }

  /**
   * Convert symbol kind string to SymbolKind enum
   */
  private symbolKindFromType(type: string): SymbolKind {
    switch (type) {
      case "function":
        return SymbolKind.Function;
      case "struct":
        return SymbolKind.Class;
      case "enum":
        return SymbolKind.Enum;
      case "type-alias":
        return SymbolKind.TypeParameter;
      case "variable":
        return SymbolKind.Variable;
      default:
        return SymbolKind.Variable;
    }
  }

  /**
   * Convert AST node to LSP Range
   */
  private nodeToRange(node: AST.ASTNode): Range | null {
    if (!node.location) return null;

    const loc = node.location;
    return Range.create(
      (loc.startLine ?? 1) - 1,
      (loc.startColumn ?? 1) - 1,
      (loc.endLine ?? loc.startLine ?? 1) - 1,
      (loc.endColumn ?? loc.startColumn ?? 1) - 1,
    );
  }
}
