/**
 * Semantic Token Provider
 * Provides dynamic syntax highlighting based on semantic analysis
 * using the compiler's type checker
 */

import {
  SemanticTokens,
  SemanticTokensBuilder,
} from "vscode-languageserver/node";
import * as AST from "../../../compiler/common/AST";
import { ASTResolver } from "./ASTResolver";

/**
 * Semantic token types as defined by LSP spec
 * https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_semanticTokens
 */
export enum SemanticTokenType {
  namespace = 0,
  type = 1,
  class = 2,
  enum = 3,
  interface = 4,
  struct = 5,
  typeParameter = 6,
  parameter = 7,
  variable = 8,
  property = 9,
  enumMember = 10,
  event = 11,
  function = 12,
  method = 13,
  macro = 14,
  keyword = 15,
  modifier = 16,
  comment = 17,
  string = 18,
  number = 19,
  regexp = 20,
  operator = 21,
}

/**
 * Semantic token modifiers
 */
export enum SemanticTokenModifier {
  declaration = 0,
  definition = 1,
  readonly = 2,
  static = 3,
  deprecated = 4,
  abstract = 5,
  async = 6,
  modification = 7,
  documentation = 8,
  defaultLibrary = 9,
}

/**
 * Legend for semantic tokens - must match the order of the enums
 */
export const semanticTokensLegend = {
  tokenTypes: [
    "namespace",
    "type",
    "class",
    "enum",
    "interface",
    "struct",
    "typeParameter",
    "parameter",
    "variable",
    "property",
    "enumMember",
    "event",
    "function",
    "method",
    "macro",
    "keyword",
    "modifier",
    "comment",
    "string",
    "number",
    "regexp",
    "operator",
  ],
  tokenModifiers: [
    "declaration",
    "definition",
    "readonly",
    "static",
    "deprecated",
    "abstract",
    "async",
    "modification",
    "documentation",
    "defaultLibrary",
  ],
};

export class SemanticTokenProvider {
  constructor(private astResolver: ASTResolver) {}

  /**
   * Calculate the actual position of a name in source, skipping keywords
   */
  private getNamePosition(
    line: number,
    column: number,
    name: string,
    source: string,
  ): { line: number; column: number } {
    // Find the line in source
    const lines = source.split("\n");
    if (line < 0 || line >= lines.length) return { line, column };

    const lineText = lines[line];
    // Find the name in the line, starting from column position
    const searchStart = Math.max(0, column - 1);
    const nameIndex = lineText ? lineText.indexOf(name, searchStart) : -1;

    if (nameIndex >= 0) {
      return { line, column: nameIndex };
    }

    // Fallback to original position
    return { line, column };
  }

  /**
   * Provide semantic tokens for an entire document
   */
  provideSemanticTokens(filePath: string): SemanticTokens | null {
    console.log(`[SemanticTokens] Providing tokens for ${filePath}`);

    const ast = this.astResolver.getAST(filePath);
    if (!ast) {
      console.log(`[SemanticTokens] Could not parse ${filePath}`);
      return null;
    }

    console.log(
      `[SemanticTokens] AST parsed successfully, starting token generation`,
    );

    // Get source for name position calculations
    const source = this.astResolver.getSource(filePath) || "";

    const builder = new SemanticTokensBuilder();
    this.visitNode(ast, builder, source);

    const result = builder.build();
    console.log(`[SemanticTokens] Generated ${result.data.length / 5} tokens`);
    return result;
  }

  /**
   * Visit an AST node and generate semantic tokens
   */
  private visitNode(
    node: any,
    builder: SemanticTokensBuilder,
    source: string,
  ): void {
    if (!node || typeof node !== "object") return;

    // Handle different node types
    if (node.kind) {
      switch (node.kind) {
        case "FunctionDecl":
          this.visitFunctionDecl(node as AST.FunctionDecl, builder, source);
          break;

        case "StructDecl":
          this.visitStructDecl(node as AST.StructDecl, builder, source);
          break;

        case "EnumDecl":
          this.visitEnumDecl(node as AST.EnumDecl, builder, source);
          break;

        case "SpecDecl":
          this.visitSpecDecl(node as AST.SpecDecl, builder, source);
          break;

        case "VariableDecl":
          this.visitVariableDecl(node as AST.VariableDecl, builder, source);
          break;

        case "Identifier":
          this.visitIdentifier(node as AST.IdentifierExpr, builder);
          break;

        case "Member":
          this.visitMemberExpr(node as AST.MemberExpr, builder);
          break;

        case "Call":
          this.visitCallExpr(node as AST.CallExpr, builder, source);
          break;

        case "Parameter":
          this.visitParameter(node as AST.Parameter, builder);
          break;

        case "LambdaParameter":
          this.visitLambdaParameter(node as AST.LambdaParameter, builder);
          break;

        case "TypeAliasDecl":
          this.visitTypeAliasDecl(node as AST.TypeAliasDecl, builder, source);
          break;

        case "ImportStmt":
          this.visitImportStmt(node as AST.ImportStmt, builder);
          break;

        case "ExportStmt":
          this.visitExportStmt(node as AST.ExportStmt, builder);
          break;

        case "BasicType":
          this.visitBasicType(node as AST.BasicTypeNode, builder);
          break;

        case "EnumStructVariant":
          this.visitEnumStructVariant(
            node as AST.EnumStructVariantExpr,
            builder,
          );
          break;

        case "PatternEnum":
          this.visitPatternEnum(node as AST.PatternEnum, builder);
          break;

        case "PatternEnumTuple":
          this.visitPatternEnumTuple(node as AST.PatternEnumTuple, builder);
          break;

        case "PatternEnumStruct":
          this.visitPatternEnumStruct(node as AST.PatternEnumStruct, builder);
          break;

        case "PatternIdentifier":
          this.visitPatternIdentifier(node as AST.PatternIdentifier, builder);
          break;
      }
    }

    // Recursively visit children
    if (Array.isArray(node)) {
      for (const item of node) {
        this.visitNode(item, builder, source);
      }
    } else {
      for (const key of Object.keys(node)) {
        // Skip the 'callee' of Call expressions since we handle it explicitly in visitCallExpr
        if (node.kind === "Call" && key === "callee") {
          continue;
        }

        const value = node[key];
        if (value && typeof value === "object") {
          this.visitNode(value, builder, source);
        }
      }
    }
  }

  /**
   * Visit function declaration
   */
  private visitFunctionDecl(
    node: AST.FunctionDecl,
    builder: SemanticTokensBuilder,
    source: string,
  ): void {
    if (!node.location) return;

    const namePos = this.getNamePosition(
      node.location.startLine - 1,
      node.location.startColumn - 1,
      node.name,
      source,
    );

    const modifiers = [];
    if (node.isStatic) modifiers.push(1 << SemanticTokenModifier.static);
    if (!node.isFrame) modifiers.push(1 << SemanticTokenModifier.readonly);

    this.pushToken(
      builder,
      namePos.line,
      namePos.column,
      node.name.length,
      SemanticTokenType.function,
      modifiers.reduce((a, b) => a | b, 1 << SemanticTokenModifier.declaration),
    );
  }

  /**
   * Visit struct declaration
   */
  private visitStructDecl(
    node: AST.StructDecl,
    builder: SemanticTokensBuilder,
    source: string,
  ): void {
    if (!node.location) return;

    const namePos = this.getNamePosition(
      node.location.startLine - 1,
      node.location.startColumn - 1,
      node.name,
      source,
    );

    this.pushToken(
      builder,
      namePos.line,
      namePos.column,
      node.name.length,
      SemanticTokenType.struct,
      1 << SemanticTokenModifier.declaration,
    );
  }

  /**
   * Visit enum declaration
   */
  private visitEnumDecl(
    node: AST.EnumDecl,
    builder: SemanticTokensBuilder,
    source: string,
  ): void {
    if (!node.location) return;

    const namePos = this.getNamePosition(
      node.location.startLine - 1,
      node.location.startColumn - 1,
      node.name,
      source,
    );

    this.pushToken(
      builder,
      namePos.line,
      namePos.column,
      node.name.length,
      SemanticTokenType.enum,
      1 << SemanticTokenModifier.declaration,
    );
  }

  /**
   * Visit spec (interface) declaration
   */
  private visitSpecDecl(
    node: AST.SpecDecl,
    builder: SemanticTokensBuilder,
    source: string,
  ): void {
    if (!node.location) return;

    const namePos = this.getNamePosition(
      node.location.startLine - 1,
      node.location.startColumn - 1,
      node.name,
      source,
    );

    this.pushToken(
      builder,
      namePos.line,
      namePos.column,
      node.name.length,
      SemanticTokenType.interface,
      1 << SemanticTokenModifier.declaration,
    );
  }

  /**
   * Visit variable declaration
   */
  private visitVariableDecl(
    node: AST.VariableDecl,
    builder: SemanticTokensBuilder,
    source: string,
  ): void {
    if (!node.location) return;
    if (typeof node.name !== "string") return; // Skip destructuring for now

    const namePos = this.getNamePosition(
      node.location.startLine - 1,
      node.location.startColumn - 1,
      node.name,
      source,
    );

    const modifiers = [];
    if (node.isGlobal) modifiers.push(1 << SemanticTokenModifier.static);
    if (node.isConst) modifiers.push(1 << SemanticTokenModifier.readonly);

    this.pushToken(
      builder,
      namePos.line,
      namePos.column,
      node.name.length,
      SemanticTokenType.variable,
      modifiers.reduce((a, b) => a | b, 1 << SemanticTokenModifier.declaration),
    );
  }

  /**
   * Visit identifier expression
   */
  private visitIdentifier(
    node: AST.IdentifierExpr,
    builder: SemanticTokensBuilder,
  ): void {
    if (!node.location) return;

    // Determine token type based on resolved declaration
    let tokenType = SemanticTokenType.variable;
    let modifiers = 0;

    if (node.resolvedDeclaration) {
      switch (node.resolvedDeclaration.kind) {
        case "FunctionDecl":
        case "Extern":
          tokenType = SemanticTokenType.function;
          break;
        case "StructDecl":
          tokenType = SemanticTokenType.struct;
          break;
        case "Parameter":
        case "LambdaParameter":
          tokenType = SemanticTokenType.parameter;
          break;
        case "VariableDecl":
          tokenType = SemanticTokenType.variable;
          if ((node.resolvedDeclaration as AST.VariableDecl).isConst) {
            modifiers |= 1 << SemanticTokenModifier.readonly;
          }
          break;
      }
    }

    this.pushToken(
      builder,
      node.location.startLine - 1,
      node.location.startColumn - 1,
      node.name.length,
      tokenType,
      modifiers,
    );
  }

  /**
   * Visit member expression
   */
  private visitMemberExpr(
    node: AST.MemberExpr,
    builder: SemanticTokensBuilder,
  ): void {
    if (!node.location) return;

    // Check if this is an enum variant access (e.g., Option.Some)
    if (node.object.kind === "Identifier") {
      const objIdent = node.object as AST.IdentifierExpr;
      // Use type assertion since EnumDecl is not in IdentifierExpr's type union
      const resolvedDecl = objIdent.resolvedDeclaration as any;
      if (resolvedDecl?.kind === "EnumDecl") {
        // This is an enum variant access
        this.pushToken(
          builder,
          node.location.endLine - 1,
          node.location.endColumn - node.property.length - 1,
          node.property.length,
          SemanticTokenType.enumMember,
          0,
        );
        return;
      }
    }

    // Property access - mark the property name
    // We'd need more type information to determine if it's a method or field
    this.pushToken(
      builder,
      node.location.endLine - 1, // Property is at the end
      node.location.endColumn - node.property.length - 1,
      node.property.length,
      SemanticTokenType.property,
      0,
    );
  }

  /**
   * Visit call expression
   */
  private visitCallExpr(
    node: AST.CallExpr,
    builder: SemanticTokensBuilder,
    source: string,
  ): void {
    // If the callee is a member access, it's a method call
    if (node.callee.kind === "Member") {
      const member = node.callee as AST.MemberExpr;

      // Visit the object FIRST (for correct token ordering)
      // e.g., in res.status().json(), visit res.status() before pushing json token
      this.visitNode(member.object, builder, source);

      // Then push the method token (after object is visited)
      if (member.location) {
        this.pushToken(
          builder,
          member.location.endLine - 1,
          member.location.endColumn - member.property.length - 1,
          member.property.length,
          SemanticTokenType.method,
          0,
        );
      }
    }
    // If it's a direct identifier, it's a function call
    else if (node.callee.kind === "Identifier") {
      const ident = node.callee as AST.IdentifierExpr;
      if (ident.location) {
        this.pushToken(
          builder,
          ident.location.startLine - 1,
          ident.location.startColumn - 1,
          ident.name.length,
          SemanticTokenType.function,
          0,
        );
      }
    }
  }

  /**
   * Visit parameter
   */
  private visitParameter(
    node: AST.Parameter,
    builder: SemanticTokensBuilder,
  ): void {
    if (!node.location) {
      console.log(`[SemanticTokens] Parameter ${node.name} has no location`);
      return;
    }

    const modifiers = node.isConst ? 1 << SemanticTokenModifier.readonly : 0;

    this.pushToken(
      builder,
      node.location.startLine - 1,
      node.location.startColumn - 1,
      node.name.length,
      SemanticTokenType.parameter,
      modifiers | (1 << SemanticTokenModifier.declaration),
    );
  }

  /**
   * Visit lambda parameter
   */
  private visitLambdaParameter(
    node: AST.LambdaParameter,
    builder: SemanticTokensBuilder,
  ): void {
    if (!node.location) {
      console.log(
        `[SemanticTokens] LambdaParameter ${node.name} has no location`,
      );
      return;
    }

    this.pushToken(
      builder,
      node.location.startLine - 1,
      node.location.startColumn - 1,
      node.name.length,
      SemanticTokenType.parameter,
      1 << SemanticTokenModifier.declaration,
    );
  }

  /**
   * Visit enum struct variant construction (e.g., Option.Some { value: 10 })
   */
  private visitEnumStructVariant(
    node: AST.EnumStructVariantExpr,
    builder: SemanticTokensBuilder,
  ): void {
    if (!node.location) return;

    // Highlight enum name and variant name separately
    // Format: EnumName.VariantName { ... }
    const _fullText = `${node.enumName}.${node.variantName}`;
    const enumEndCol = node.location.startColumn - 1 + node.enumName.length;
    const variantStartCol = enumEndCol + 1; // +1 for the dot

    // Highlight enum name
    this.pushToken(
      builder,
      node.location.startLine - 1,
      node.location.startColumn - 1,
      node.enumName.length,
      SemanticTokenType.enum,
      0,
    );

    // Highlight variant name
    this.pushToken(
      builder,
      node.location.startLine - 1,
      variantStartCol,
      node.variantName.length,
      SemanticTokenType.enumMember,
      0,
    );
  }

  /**
   * Visit pattern enum (match patterns like Option.Some)
   */
  private visitPatternEnum(
    node: AST.PatternEnum,
    builder: SemanticTokensBuilder,
  ): void {
    if (!node.location) return;

    // Highlight enum name and variant name
    // Format: EnumName.VariantName
    const enumEndCol = node.location.startColumn - 1 + node.enumName.length;
    const variantStartCol = enumEndCol + 1; // +1 for the dot

    this.pushToken(
      builder,
      node.location.startLine - 1,
      node.location.startColumn - 1,
      node.enumName.length,
      SemanticTokenType.enum,
      0,
    );

    this.pushToken(
      builder,
      node.location.startLine - 1,
      variantStartCol,
      node.variantName.length,
      SemanticTokenType.enumMember,
      0,
    );
  }

  /**
   * Visit pattern enum tuple (match patterns like Option.Some(value))
   */
  private visitPatternEnumTuple(
    node: AST.PatternEnumTuple,
    builder: SemanticTokensBuilder,
  ): void {
    if (!node.location) return;

    // Highlight enum name and variant name
    const enumEndCol = node.location.startColumn - 1 + node.enumName.length;
    const variantStartCol = enumEndCol + 1;

    this.pushToken(
      builder,
      node.location.startLine - 1,
      node.location.startColumn - 1,
      node.enumName.length,
      SemanticTokenType.enum,
      0,
    );

    this.pushToken(
      builder,
      node.location.startLine - 1,
      variantStartCol,
      node.variantName.length,
      SemanticTokenType.enumMember,
      0,
    );

    // Highlight binding variables as parameters
    // Note: bindings are just strings, we'd need location info from parser
  }

  /**
   * Visit pattern enum struct (match patterns like Option.Some { value })
   */
  private visitPatternEnumStruct(
    node: AST.PatternEnumStruct,
    builder: SemanticTokensBuilder,
  ): void {
    if (!node.location) return;

    // Highlight enum name and variant name
    const enumEndCol = node.location.startColumn - 1 + node.enumName.length;
    const variantStartCol = enumEndCol + 1;

    this.pushToken(
      builder,
      node.location.startLine - 1,
      node.location.startColumn - 1,
      node.enumName.length,
      SemanticTokenType.enum,
      0,
    );

    this.pushToken(
      builder,
      node.location.startLine - 1,
      variantStartCol,
      node.variantName.length,
      SemanticTokenType.enumMember,
      0,
    );
  }

  /**
   * Visit pattern identifier (match pattern variables)
   */
  private visitPatternIdentifier(
    node: AST.PatternIdentifier,
    builder: SemanticTokensBuilder,
  ): void {
    if (!node.location) return;

    // Pattern bindings are like parameters
    this.pushToken(
      builder,
      node.location.startLine - 1,
      node.location.startColumn - 1,
      node.name.length,
      SemanticTokenType.parameter,
      1 << SemanticTokenModifier.declaration,
    );
  }

  /**
   * Visit type alias declaration
   */
  private visitTypeAliasDecl(
    node: AST.TypeAliasDecl,
    builder: SemanticTokensBuilder,
    source: string,
  ): void {
    if (!node.location) return;

    const namePos = this.getNamePosition(
      node.location.startLine - 1,
      node.location.startColumn - 1,
      node.name,
      source,
    );

    this.pushToken(
      builder,
      namePos.line,
      namePos.column,
      node.name.length,
      SemanticTokenType.type,
      1 << SemanticTokenModifier.declaration,
    );
  }

  /**
   * Visit import statement
   */
  private visitImportStmt(
    node: AST.ImportStmt,
    _builder: SemanticTokensBuilder,
  ): void {
    // Color imported items
    if (node.items && Array.isArray(node.items)) {
      for (const _item of node.items) {
        // We don't have location info for individual imports, so skip for now
        // The symbol index will still handle these
      }
    }
  }

  /**
   * Visit export statement
   */
  private visitExportStmt(
    _node: AST.ExportStmt,
    _builder: SemanticTokensBuilder,
  ): void {
    // Export items don't have location info in the AST
    // The exported declarations will be visited separately
  }

  /**
   * Visit BasicType node (type references)
   */
  private visitBasicType(
    node: AST.BasicTypeNode,
    builder: SemanticTokensBuilder,
  ): void {
    if (!node.location) return;

    // Determine if this is a builtin type or user-defined type
    const builtinTypes = new Set([
      "int",
      "uint",
      "u8",
      "u16",
      "u32",
      "u64",
      "i8",
      "i16",
      "i32",
      "i64",
      "float",
      "f32",
      "f64",
      "bool",
      "char",
      "string",
      "void",
      "any",
      "Func",
      "Lambda",
    ]);

    if (!builtinTypes.has(node.name)) {
      // User-defined type - account for pointer depth in position
      const pointerOffset = node.pointerDepth || 0;
      this.pushToken(
        builder,
        node.location.startLine - 1,
        node.location.startColumn - 1 + pointerOffset,
        node.name.length,
        SemanticTokenType.type,
        0,
      );
    }
  }

  /**
   * Helper to push a token to the builder
   */
  private pushToken(
    builder: SemanticTokensBuilder,
    line: number,
    char: number,
    length: number,
    tokenType: SemanticTokenType,
    tokenModifiers: number,
  ): void {
    if (line < 0 || char < 0 || length <= 0) return;
    builder.push(line, char, length, tokenType, tokenModifiers);
  }
}
