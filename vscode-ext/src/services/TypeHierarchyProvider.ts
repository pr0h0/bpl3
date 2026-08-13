import {
  Range,
  SymbolKind,
  type TypeHierarchyItem,
  type TypeHierarchyPrepareParams,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { fileURLToPath } from "url";
import * as AST from "../../../compiler/common/AST";
import { ASTResolver } from "./ASTResolver";
import { SymbolIndex } from "./SymbolIndex";
import { filePathToUri } from "./utils";

/**
 * Provides type hierarchy support - shows struct/spec inheritance trees
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
    const filePath = fileURLToPath(document.uri);
    const content = document.getText();
    const position = params.position;

    // Parse and find node at position
    this.astResolver.parseDocumentContent(filePath, content);
    const ast = this.astResolver.getCachedAST(filePath);
    if (!ast) return null;

    const node = this.astResolver.findNodeAtPosition(
      filePath,
      position.line,
      position.character,
    );
    if (!node) return null;

    // Check if it's a type declaration or type reference
    let typeDecl: AST.StructDecl | AST.SpecDecl | null = null;

    if (node.kind === "StructDecl") {
      typeDecl = node as AST.StructDecl;
    } else if (node.kind === "SpecDecl") {
      typeDecl = node as AST.SpecDecl;
    } else if (node.kind === "Identifier") {
      const typeName = (node as AST.IdentifierExpr).name;
      typeDecl = this.findTypeDeclaration(ast, typeName);
    } else if (node.kind === "BasicType") {
      const typeName = (node as AST.BasicTypeNode).name;
      const typeRef = this.findTypeReference(ast, filePath, typeName);
      if (typeRef) {
        return [this.createTypeHierarchyItem(typeRef.decl, typeRef.filePath)];
      }
    }

    if (!typeDecl) return null;

    return [this.createTypeHierarchyItem(typeDecl, filePath)];
  }

  /**
   * Get supertypes - parent structs this inherits from
   */
  async getSupertypes(item: TypeHierarchyItem): Promise<TypeHierarchyItem[]> {
    const supertypes: TypeHierarchyItem[] = [];
    const uri = fileURLToPath(item.uri);

    const ast = this.astResolver.getCachedAST(uri);
    if (!ast) return supertypes;

    const typeDecl = this.findTypeByName(ast, item.name);
    if (!typeDecl) return supertypes;

    const parentTypes =
      typeDecl.kind === "StructDecl"
        ? typeDecl.inheritanceList
        : typeDecl.extends;
    if (!parentTypes || parentTypes.length === 0) return supertypes;

    for (const inheritedType of parentTypes) {
      const baseTypeName = this.getTypeName(inheritedType);
      if (!baseTypeName) continue;

      const baseType = this.findTypeInWorkspace(baseTypeName);
      if (baseType) {
        supertypes.push(
          this.createTypeHierarchyItem(baseType.decl, baseType.filePath),
        );
        continue;
      }

      const baseSymbol = this.symbolIndex.findSymbol(baseTypeName);
      if (
        baseSymbol &&
        baseSymbol.length > 0 &&
        baseSymbol[0] &&
        (baseSymbol[0].kind === "struct" || baseSymbol[0].kind === "spec")
      ) {
        supertypes.push(
          this.createTypeHierarchyItem(
            baseSymbol[0].declaration as AST.StructDecl | AST.SpecDecl,
            baseSymbol[0].filePath,
          ),
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

    // Search all files for structs/specs that inherit from this one
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
            const inheritsTarget = structDecl.inheritanceList.some(
              (inheritedType) =>
                this.getTypeName(inheritedType) === targetName,
            );
            if (inheritsTarget) {
              subtypes.push(this.createTypeHierarchyItem(structDecl, filePath));
            }
          }
        } else if (stmt.kind === "SpecDecl") {
          const specDecl = stmt as AST.SpecDecl;
          if (specDecl.extends && specDecl.extends.length > 0) {
            const inheritsTarget = specDecl.extends.some(
              (inheritedType) =>
                this.getTypeName(inheritedType) === targetName,
            );
            if (inheritsTarget) {
              subtypes.push(this.createTypeHierarchyItem(specDecl, filePath));
            }
          }
        }
      }
    }

    return subtypes;
  }

  /**
   * Find type declaration by name
   */
  private findTypeDeclaration(
    ast: AST.Program,
    name: string,
  ): AST.StructDecl | AST.SpecDecl | null {
    for (const stmt of ast.statements) {
      if (stmt.kind === "StructDecl") {
        const structDecl = stmt as AST.StructDecl;
        if (structDecl.name === name) {
          return structDecl;
        }
      } else if (stmt.kind === "SpecDecl") {
        const specDecl = stmt as AST.SpecDecl;
        if (specDecl.name === name) {
          return specDecl;
        }
      }
    }
    return null;
  }

  private findTypeReference(
    ast: AST.Program,
    filePath: string,
    name: string,
  ): { decl: AST.StructDecl | AST.SpecDecl; filePath: string } | null {
    const localDecl = this.findTypeDeclaration(ast, name);
    if (localDecl) {
      return { decl: localDecl, filePath };
    }
    return this.findTypeInWorkspace(name);
  }

  /**
   * Find type by name in AST
   */
  private findTypeByName(
    ast: AST.Program,
    name: string,
  ): AST.StructDecl | AST.SpecDecl | null {
    for (const stmt of ast.statements) {
      if (stmt.kind === "StructDecl") {
        const structDecl = stmt as AST.StructDecl;
        if (structDecl.name === name) {
          return structDecl;
        }
      } else if (stmt.kind === "SpecDecl") {
        const specDecl = stmt as AST.SpecDecl;
        if (specDecl.name === name) {
          return specDecl;
        }
      }
    }
    return null;
  }

  /**
   * Find type in entire workspace
   */
  private findTypeInWorkspace(
    name: string,
  ): { decl: AST.StructDecl | AST.SpecDecl; filePath: string } | null {
    const allFiles = this.astResolver.getAllCachedFiles();

    for (const filePath of allFiles) {
      const ast = this.astResolver.getCachedAST(filePath);
      if (!ast) continue;

      const typeDecl = this.findTypeByName(ast, name);
      if (typeDecl) {
        return { decl: typeDecl, filePath };
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
   * Create type hierarchy item from type declaration
   */
  private createTypeHierarchyItem(
    typeDecl: AST.StructDecl | AST.SpecDecl,
    filePath: string,
  ): TypeHierarchyItem {
    const range = this.nodeToRange(typeDecl);
    const selectionRange = range || Range.create(0, 0, 0, 0);

    const isSpec = typeDecl.kind === "SpecDecl";
    const parentTypes = isSpec ? typeDecl.extends : typeDecl.inheritanceList;
    let detail = isSpec ? "spec" : "struct";
    if (parentTypes && parentTypes.length > 0) {
      const baseTypeName = this.getTypeName(parentTypes[0]!);
      if (baseTypeName) {
        detail = `${detail} : ${baseTypeName}`;
      }
    }

    return {
      name: typeDecl.name,
      kind: isSpec ? SymbolKind.Interface : SymbolKind.Class,
      uri: filePathToUri(filePath),
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
