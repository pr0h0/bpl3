import {
  Range,
  SymbolKind,
  type TypeHierarchyItem,
  type TypeHierarchyPrepareParams,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as AST from "../../../compiler/common/AST";
import { ASTResolver } from "./ASTResolver";
import { SymbolIndex } from "./SymbolIndex";

/**
 * Provides type hierarchy support - shows struct inheritance trees
 */
export class TypeHierarchyProvider {
  constructor(
    private astResolver: ASTResolver,
    private symbolIndex: SymbolIndex,
  ) {}

  /**
   * Prepare type hierarchy - returns the type at the position
   */
  prepare(
    params: TypeHierarchyPrepareParams,
    document: TextDocument,
  ): TypeHierarchyItem[] | null {
    const filePath = document.uri.replace("file://", "");
    const content = document.getText();
    const position = params.position;

    // Parse and find node at position
    this.astResolver.parseDocumentContent(filePath, content);
    const ast = this.astResolver.getCachedAST(filePath);
    if (!ast) return null;

    const node = this.astResolver.findNodeAtPosition(
      filePath,
      position.line + 1,
      position.character + 1,
    );
    if (!node) return null;

    // Check if it's a struct or type reference
    let structDecl: AST.StructDecl | null = null;

    if (node.kind === "StructDecl") {
      structDecl = node as AST.StructDecl;
    } else if (node.kind === "Identifier") {
      // Find the struct declaration
      const typeName = (node as AST.IdentifierExpr).name;
      structDecl = this.findStructDeclaration(ast, typeName);
    }

    if (!structDecl) return null;

    return [this.createTypeHierarchyItem(structDecl, filePath)];
  }

  /**
   * Get supertypes - parent structs this inherits from
   */
  async getSupertypes(item: TypeHierarchyItem): Promise<TypeHierarchyItem[]> {
    const supertypes: TypeHierarchyItem[] = [];
    const uri = item.uri.replace("file://", "");

    const ast = this.astResolver.getCachedAST(uri);
    if (!ast) return supertypes;

    const structDecl = this.findStructByName(ast, item.name);
    if (
      !structDecl ||
      !structDecl.inheritanceList ||
      structDecl.inheritanceList.length === 0
    )
      return supertypes;

    // Get the base type name (first element is parent struct)
    const baseTypeName = this.getTypeName(structDecl.inheritanceList[0]!);
    if (!baseTypeName) return supertypes;

    // Find the base struct
    const baseSymbol = this.symbolIndex.findSymbol(baseTypeName);
    if (
      baseSymbol &&
      baseSymbol.length > 0 &&
      baseSymbol[0] &&
      baseSymbol[0].kind === "struct"
    ) {
      const baseStruct = this.findStructInWorkspace(baseTypeName);
      if (baseStruct) {
        supertypes.push(
          this.createTypeHierarchyItem(baseStruct.decl, baseStruct.filePath),
        );
      }
    }

    return supertypes;
  }

  /**
   * Get subtypes - structs that inherit from this one
   */
  async getSubtypes(item: TypeHierarchyItem): Promise<TypeHierarchyItem[]> {
    const subtypes: TypeHierarchyItem[] = [];
    const targetName = item.name;

    // Search all files for structs that extend this one
    const allFiles = this.astResolver.getAllCachedFiles();

    for (const filePath of allFiles) {
      const ast = this.astResolver.getCachedAST(filePath);
      if (!ast) continue;

      for (const stmt of ast.statements) {
        if (stmt.kind === "StructDecl") {
          const structDecl = stmt as AST.StructDecl;
          if (
            structDecl.inheritanceList &&
            structDecl.inheritanceList.length > 0
          ) {
            const baseTypeName = this.getTypeName(
              structDecl.inheritanceList[0]!,
            );
            if (baseTypeName === targetName) {
              subtypes.push(this.createTypeHierarchyItem(structDecl, filePath));
            }
          }
        }
      }
    }

    return subtypes;
  }

  /**
   * Find struct declaration by name
   */
  private findStructDeclaration(
    ast: AST.Program,
    name: string,
  ): AST.StructDecl | null {
    for (const stmt of ast.statements) {
      if (stmt.kind === "StructDecl") {
        const structDecl = stmt as AST.StructDecl;
        if (structDecl.name === name) {
          return structDecl;
        }
      }
    }
    return null;
  }

  /**
   * Find struct by name in AST
   */
  private findStructByName(
    ast: AST.Program,
    name: string,
  ): AST.StructDecl | null {
    for (const stmt of ast.statements) {
      if (stmt.kind === "StructDecl") {
        const structDecl = stmt as AST.StructDecl;
        if (structDecl.name === name) {
          return structDecl;
        }
      }
    }
    return null;
  }

  /**
   * Find struct in entire workspace
   */
  private findStructInWorkspace(
    name: string,
  ): { decl: AST.StructDecl; filePath: string } | null {
    const allFiles = this.astResolver.getAllCachedFiles();

    for (const filePath of allFiles) {
      const ast = this.astResolver.getCachedAST(filePath);
      if (!ast) continue;

      const structDecl = this.findStructByName(ast, name);
      if (structDecl) {
        return { decl: structDecl, filePath };
      }
    }

    return null;
  }

  /**
   * Extract type name from TypeNode
   */
  private getTypeName(type: AST.TypeNode): string | null {
    if (type.kind === "BasicType") {
      return (type as AST.BasicTypeNode).name;
    }
    return null;
  }

  /**
   * Create type hierarchy item from struct declaration
   */
  private createTypeHierarchyItem(
    structDecl: AST.StructDecl,
    filePath: string,
  ): TypeHierarchyItem {
    const range = this.nodeToRange(structDecl);
    const selectionRange = range || Range.create(0, 0, 0, 0);

    // Build detail string showing base type if any
    let detail = "struct";
    if (structDecl.inheritanceList && structDecl.inheritanceList.length > 0) {
      const baseTypeName = this.getTypeName(structDecl.inheritanceList[0]!);
      if (baseTypeName) {
        detail = `struct : ${baseTypeName}`;
      }
    }

    return {
      name: structDecl.name,
      kind: SymbolKind.Class,
      uri: `file://${filePath}`,
      range: selectionRange,
      selectionRange: selectionRange,
      detail: detail,
    };
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
