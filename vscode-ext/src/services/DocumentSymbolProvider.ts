import {
  type DocumentSymbolParams,
  DocumentSymbol,
  SymbolKind,
  Range,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as AST from "../../../compiler/common/AST";
import { ASTResolver } from "./ASTResolver";

/**
 * Provides document symbols for outline view and quick navigation.
 */
export class DocumentSymbolProvider {
  constructor(private astResolver: ASTResolver) {}

  /**
   * Handle document symbol request
   */
  handle(
    params: DocumentSymbolParams,
    document: TextDocument,
  ): DocumentSymbol[] | null {
    const filePath = document.uri.replace("file://", "");
    const content = document.getText();

    // Parse document
    this.astResolver.parseDocumentContent(filePath, content);
    const ast = this.astResolver.getCachedAST(filePath);
    if (!ast) return null;

    const symbols: DocumentSymbol[] = [];

    // Extract symbols from AST
    for (const stmt of ast.statements) {
      const symbol = this.statementToSymbol(stmt);
      if (symbol) {
        symbols.push(symbol);
      }
    }

    return symbols.length > 0 ? symbols : null;
  }

  /**
   * Convert statement to document symbol
   */
  private statementToSymbol(stmt: AST.Statement): DocumentSymbol | null {
    switch (stmt.kind) {
      case "FunctionDecl":
        return this.functionToSymbol(stmt as AST.FunctionDecl);

      case "StructDecl":
        return this.structToSymbol(stmt as AST.StructDecl);

      case "EnumDecl":
        return this.enumToSymbol(stmt as AST.EnumDecl);

      case "VariableDecl":
        return this.variableToSymbol(stmt as AST.VariableDecl);

      case "TypeAlias":
        return this.typeAliasToSymbol(stmt as AST.TypeAliasDecl);

      default:
        return null;
    }
  }

  /**
   * Convert function declaration to symbol
   */
  private functionToSymbol(func: AST.FunctionDecl): DocumentSymbol | null {
    if (!func.location) return null;

    const paramTypes = func.params
      .map((p: AST.Parameter) => `${p.name}: ${this.typeNodeToString(p.type)}`)
      .join(", ");
    const returnType = this.typeNodeToString(func.returnType);
    const detail = `(${paramTypes}) ret ${returnType}`;

    const symbol = DocumentSymbol.create(
      func.name,
      detail,
      SymbolKind.Function,
      this.locationToRange(func.location),
      this.locationToRange(func.location),
    );

    // Add local variables as children if they have explicit declarations
    if (func.body) {
      symbol.children = [];
      for (const stmt of func.body.statements) {
        if (stmt.kind === "VariableDecl") {
          const varSymbol = this.variableToSymbol(stmt as AST.VariableDecl);
          if (varSymbol) {
            symbol.children.push(varSymbol);
          }
        }
      }
    }

    return symbol;
  }

  /**
   * Convert struct declaration to symbol
   */
  private structToSymbol(struct: AST.StructDecl): DocumentSymbol | null {
    if (!struct.location) return null;

    const detail =
      struct.genericParams.length > 0
        ? `<${struct.genericParams.map((p: AST.GenericParam) => p.name).join(", ")}>`
        : "";

    const symbol = DocumentSymbol.create(
      struct.name,
      detail,
      SymbolKind.Class,
      this.locationToRange(struct.location),
      this.locationToRange(struct.location),
    );

    // Add fields and methods as children
    symbol.children = [];

    for (const member of struct.members) {
      if (member.kind === "StructField") {
        const field = member as AST.StructField;
        if (field.location) {
          const fieldSymbol = DocumentSymbol.create(
            field.name,
            this.typeNodeToString(field.type),
            SymbolKind.Field,
            this.locationToRange(field.location),
            this.locationToRange(field.location),
          );
          symbol.children.push(fieldSymbol);
        }
      }
    }

    for (const member of struct.members) {
      if (member.kind === "FunctionDecl") {
        const methodSymbol = this.functionToSymbol(member);
        if (methodSymbol) {
          methodSymbol.kind = SymbolKind.Method;
          symbol.children.push(methodSymbol);
        }
      }
    }

    return symbol;
  }

  /**
   * Convert enum declaration to symbol
   */
  private enumToSymbol(enumDecl: AST.EnumDecl): DocumentSymbol | null {
    if (!enumDecl.location) return null;

    const detail =
      enumDecl.genericParams.length > 0
        ? `<${enumDecl.genericParams.map((p: AST.GenericParam) => p.name).join(", ")}>`
        : "";

    const symbol = DocumentSymbol.create(
      enumDecl.name,
      detail,
      SymbolKind.Enum,
      this.locationToRange(enumDecl.location),
      this.locationToRange(enumDecl.location),
    );

    // Add variants as children
    symbol.children = [];
    for (const variant of enumDecl.variants) {
      if (variant.location) {
        let variantDetail = "";
        if (variant.dataType) {
          if (variant.dataType.kind === "EnumVariantTuple") {
            const types = (variant.dataType as AST.EnumVariantTuple).types;
            variantDetail = `(${types.map((t: AST.TypeNode) => this.typeNodeToString(t)).join(", ")})`;
          } else if (variant.dataType.kind === "EnumVariantStruct") {
            variantDetail = "{...}";
          }
        }

        const variantSymbol = DocumentSymbol.create(
          variant.name,
          variantDetail,
          SymbolKind.EnumMember,
          this.locationToRange(variant.location),
          this.locationToRange(variant.location),
        );
        symbol.children.push(variantSymbol);
      }
    }

    return symbol;
  }

  /**
   * Convert variable declaration to symbol
   */
  private variableToSymbol(varStmt: AST.VariableDecl): DocumentSymbol | null {
    if (!varStmt.location) return null;

    const typeStr = this.typeNodeToString(varStmt.typeAnnotation);
    const kind = varStmt.isConst ? SymbolKind.Constant : SymbolKind.Variable;
    const name =
      typeof varStmt.name === "string" ? varStmt.name : "_destructured";

    return DocumentSymbol.create(
      name,
      typeStr,
      kind,
      this.locationToRange(varStmt.location),
      this.locationToRange(varStmt.location),
    );
  }

  /**
   * Convert type alias to symbol
   */
  private typeAliasToSymbol(
    typeAlias: AST.TypeAliasDecl,
  ): DocumentSymbol | null {
    if (!typeAlias.location) return null;

    const detail = this.typeNodeToString(typeAlias.type);

    return DocumentSymbol.create(
      typeAlias.name,
      detail,
      SymbolKind.TypeParameter,
      this.locationToRange(typeAlias.location),
      this.locationToRange(typeAlias.location),
    );
  }

  /**
   * Convert type node to string
   */
  private typeNodeToString(type: AST.TypeNode | undefined): string {
    if (!type) return "void";

    switch (type.kind) {
      case "BasicType":
        let name = type.name;
        if (type.genericArgs && type.genericArgs.length > 0) {
          name += `<${type.genericArgs.map((t: AST.TypeNode) => this.typeNodeToString(t)).join(", ")}>`;
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

      case "FunctionType":
        const params = type.paramTypes
          .map((t: AST.TypeNode) => this.typeNodeToString(t))
          .join(", ");
        const ret = this.typeNodeToString(type.returnType);
        return `Func<${ret}>(${params})`;

      case "TupleType":
        return `(${type.types.map((t: AST.TypeNode) => this.typeNodeToString(t)).join(", ")})`;

      default:
        return "unknown";
    }
  }

  /**
   * Convert source location to LSP Range
   */
  private locationToRange(location: {
    file: string;
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  }): Range {
    // Handle potentially missing location data
    const startLine = location.startLine ?? 1;
    const startColumn = location.startColumn ?? 1;
    const endLine = location.endLine ?? startLine;
    const endColumn = location.endColumn ?? startColumn;

    return Range.create(
      startLine - 1,
      startColumn - 1,
      endLine - 1,
      endColumn - 1,
    );
  }
}
