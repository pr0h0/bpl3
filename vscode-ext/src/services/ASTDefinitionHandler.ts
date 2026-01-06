/**
 * AST-based Definition Handler
 * Provides "Go to Definition" using the compiler's parser
 */

import {
  Location,
  Range,
  type TextDocumentPositionParams,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { fileURLToPath, pathToFileURL } from "url";
import * as AST from "../../../compiler/common/AST";
import { ASTResolver } from "./ASTResolver";
import { SymbolIndex } from "./SymbolIndex";

export class ASTDefinitionHandler {
  constructor(
    private astResolver: ASTResolver,
    private symbolIndex: SymbolIndex,
  ) {}

  /**
   * Handle definition request using AST-based resolution
   */
  handle(
    params: TextDocumentPositionParams,
    _document: TextDocument,
  ): Location | null {
    try {
      const filePath = fileURLToPath(params.textDocument.uri);
      console.log(
        `[ASTDefinition] Definition at ${filePath}:${params.position.line + 1}:${params.position.character + 1}`,
      );

      // Find the AST node at the cursor position
      const node = this.astResolver.findNodeAtPosition(
        filePath,
        params.position.line,
        params.position.character,
      );

      if (!node) {
        console.log(`[ASTDefinition] No AST node found at position`);
        return null;
      }

      console.log(`[ASTDefinition] Found node kind: ${node.kind}`);

      // Handle different node types
      switch (node.kind) {
        case "Identifier":
          return this.handleIdentifier(node as AST.IdentifierExpr, filePath);

        case "Member":
          return this.handleMemberExpr(node as AST.MemberExpr, filePath);

        case "Call":
          return this.handleCallExpr(node as AST.CallExpr, filePath);

        case "BasicType":
          return this.handleBasicType(node as AST.BasicTypeNode, filePath);

        case "PatternIdentifier":
        case "PatternEnum":
        case "PatternEnumTuple":
        case "PatternEnumStruct":
          // Pattern variables - already at declaration
          return Location.create(
            pathToFileURL(filePath).toString(),
            Range.create(
              {
                line: node.location.startLine - 1,
                character: node.location.startColumn - 1,
              },
              {
                line: node.location.endLine - 1,
                character: node.location.endColumn - 1,
              },
            ),
          );

        case "TypeAliasDecl":
        case "StructDecl":
        case "EnumDecl":
        case "SpecDecl":
        case "FunctionDecl":
        case "VariableDecl":
          // Already at the declaration, stay here
          return Location.create(
            pathToFileURL(filePath).toString(),
            Range.create(
              {
                line: node.location.startLine - 1,
                character: node.location.startColumn - 1,
              },
              {
                line: node.location.endLine - 1,
                character: node.location.endColumn - 1,
              },
            ),
          );

        default:
          console.log(`[ASTDefinition] Unhandled node kind: ${node.kind}`);
          return null;
      }
    } catch (error) {
      console.error(`[ASTDefinition] Error in handle():`, error);
      return null;
    }
  }

  /**
   * Handle identifier - go to its declaration
   */
  private handleIdentifier(
    node: AST.IdentifierExpr,
    filePath: string,
  ): Location | null {
    const name = node.name;
    console.log(`[ASTDefinition] Identifier: ${name}`);

    // Check if there's a resolved declaration
    if (node.resolvedDeclaration && node.resolvedDeclaration.location) {
      const decl = node.resolvedDeclaration;
      console.log(`[ASTDefinition] Found via resolvedDeclaration`);
      return Location.create(
        pathToFileURL(filePath).toString(),
        Range.create(
          {
            line: decl.location.startLine - 1,
            character: decl.location.startColumn - 1,
          },
          {
            line: decl.location.endLine - 1,
            character: decl.location.endColumn - 1,
          },
        ),
      );
    }

    // Try to find local variable declaration in the same file
    const ast = this.astResolver.getAST(filePath);
    if (ast) {
      console.log(`[ASTDefinition] Searching AST for local variable: ${name}`);
      const varDecl = this.findVariableDeclaration(ast, name, node);
      if (varDecl && varDecl.location) {
        console.log(`[ASTDefinition] Found local variable declaration`);
        return Location.create(
          pathToFileURL(filePath).toString(),
          Range.create(
            {
              line: varDecl.location.startLine - 1,
              character: varDecl.location.startColumn - 1,
            },
            {
              line: varDecl.location.endLine - 1,
              character: varDecl.location.endColumn - 1,
            },
          ),
        );
      }

      // Try to find pattern variable
      console.log(
        `[ASTDefinition] Searching AST for pattern variable: ${name}`,
      );
      const patternVar = this.findPatternVariable(ast, name, node);
      if (patternVar && patternVar.location) {
        console.log(`[ASTDefinition] Found pattern variable declaration`);
        return Location.create(
          pathToFileURL(filePath).toString(),
          Range.create(
            {
              line: patternVar.location.startLine - 1,
              character: patternVar.location.startColumn - 1,
            },
            {
              line: patternVar.location.endLine - 1,
              character: patternVar.location.endColumn - 1,
            },
          ),
        );
      }
    }

    // Fall back to symbol index
    const symbols = this.symbolIndex.findSymbol(name);
    if (symbols.length > 0) {
      const symbol = symbols[0];
      if (!symbol) return null;

      console.log(`[ASTDefinition] Found in symbol index: ${name}`);
      return Location.create(
        pathToFileURL(symbol.filePath).toString(),
        Range.create(
          {
            line: symbol.location.startLine - 1,
            character: symbol.location.startColumn - 1,
          },
          {
            line: symbol.location.endLine - 1,
            character: symbol.location.endColumn - 1,
          },
        ),
      );
    }

    return null;
  }

  /**
   * Handle member expression - go to field/method definition
   */
  private handleMemberExpr(
    node: AST.MemberExpr,
    filePath: string,
  ): Location | null {
    const memberName = node.property;
    console.log(`[ASTDefinition] Member: ${memberName}`);

    // Resolve the type of the object
    const objectType = this.astResolver.resolveType(node.object, filePath);
    if (!objectType) {
      console.log(`[ASTDefinition] Could not resolve object type`);
      return null;
    }

    console.log(`[ASTDefinition] Object type: ${objectType}`);

    // Extract base type
    const baseType = objectType
      .replace(/^\*+/, "")
      .replace(/\[\]$/, "")
      .replace(/<.*>/, "");

    // Look up the type in symbol index
    const symbols = this.symbolIndex.findSymbol(baseType);
    if (symbols.length === 0) {
      console.log(`[ASTDefinition] Type not found: ${baseType}`);
      return null;
    }

    for (const symbol of symbols) {
      // Check methods
      if (symbol.methods) {
        const method = symbol.methods.find((m) => m.name === memberName);
        if (method) {
          console.log(`[ASTDefinition] Found method: ${memberName}`);
          return Location.create(
            pathToFileURL(symbol.filePath).toString(),
            Range.create(
              {
                line: method.location.startLine - 1,
                character: method.location.startColumn - 1,
              },
              {
                line: method.location.endLine - 1,
                character: method.location.endColumn - 1,
              },
            ),
          );
        }
      }

      // Check fields - go to struct definition
      if (symbol.fields) {
        const field = symbol.fields.find((f) => f.name === memberName);
        if (field) {
          console.log(`[ASTDefinition] Found field: ${memberName}`);
          // Fields don't have location, so go to struct
          return Location.create(
            pathToFileURL(symbol.filePath).toString(),
            Range.create(
              {
                line: symbol.location.startLine - 1,
                character: symbol.location.startColumn - 1,
              },
              {
                line: symbol.location.endLine - 1,
                character: symbol.location.endColumn - 1,
              },
            ),
          );
        }
      }

      // Check enum variants
      if (symbol.variants) {
        const variant = symbol.variants.find((v) => v.name === memberName);
        if (variant) {
          console.log(`[ASTDefinition] Found enum variant: ${memberName}`);
          // Variants don't have location, go to enum
          return Location.create(
            pathToFileURL(symbol.filePath).toString(),
            Range.create(
              {
                line: symbol.location.startLine - 1,
                character: symbol.location.startColumn - 1,
              },
              {
                line: symbol.location.endLine - 1,
                character: symbol.location.endColumn - 1,
              },
            ),
          );
        }
      }
    }

    return null;
  }

  /**
   * Handle call expression
   */
  private handleCallExpr(
    node: AST.CallExpr,
    filePath: string,
  ): Location | null {
    console.log(`[ASTDefinition] Call expression`);

    // If it's a member call, handle as member
    if (node.callee.kind === "Member") {
      return this.handleMemberExpr(node.callee as AST.MemberExpr, filePath);
    }

    // If it's an identifier call, handle as identifier
    if (node.callee.kind === "Identifier") {
      return this.handleIdentifier(node.callee as AST.IdentifierExpr, filePath);
    }

    return null;
  }

  /**
   * Handle BasicType - go to type definition
   */
  private handleBasicType(
    node: AST.BasicTypeNode,
    filePath: string,
  ): Location | null {
    const typeName = node.name;
    console.log(`[ASTDefinition] BasicType: ${typeName}`);

    // Check if there's a resolved declaration
    if (node.resolvedDeclaration && node.resolvedDeclaration.location) {
      const decl = node.resolvedDeclaration;
      return Location.create(
        pathToFileURL(filePath).toString(),
        Range.create(
          {
            line: decl.location.startLine - 1,
            character: decl.location.startColumn - 1,
          },
          {
            line: decl.location.endLine - 1,
            character: decl.location.endColumn - 1,
          },
        ),
      );
    }

    // Fall back to symbol index
    const symbols = this.symbolIndex.findSymbol(typeName);
    if (symbols.length > 0) {
      const symbol = symbols[0];
      if (!symbol) return null;

      console.log(`[ASTDefinition] Found type in symbol index: ${typeName}`);

      return Location.create(
        pathToFileURL(symbol.filePath).toString(),
        Range.create(
          {
            line: symbol.location.startLine - 1,
            character: symbol.location.startColumn - 1,
          },
          {
            line: symbol.location.endLine - 1,
            character: symbol.location.endColumn - 1,
          },
        ),
      );
    }

    console.log(`[ASTDefinition] Type not found: ${typeName}`);
    return null;
  }

  /**
   * Find a variable declaration in the AST by name
   */
  private findVariableDeclaration(
    ast: AST.Program,
    name: string,
    beforeNode: AST.ASTNode,
  ): AST.VariableDecl | null {
    let found: AST.VariableDecl | null = null;

    const traverse = (node: any): void => {
      if (!node || typeof node !== "object") return;

      // Stop if we've reached the node we're searching from
      if (node === beforeNode) return;

      // Check if this is a variable declaration with matching name
      if (node.kind === "VariableDecl" && node.name === name) {
        // Only consider declarations that come before the reference
        if (
          node.location &&
          beforeNode.location &&
          (node.location.startLine < beforeNode.location.startLine ||
            (node.location.startLine === beforeNode.location.startLine &&
              node.location.startColumn < beforeNode.location.startColumn))
        ) {
          found = node;
        }
      }

      // Recursively traverse children
      if (Array.isArray(node)) {
        for (const item of node) {
          traverse(item);
        }
      } else {
        for (const key of Object.keys(node)) {
          traverse(node[key]);
        }
      }
    };

    traverse(ast);
    return found;
  }

  /**
   * Find pattern variable in match expressions
   */
  private findPatternVariable(
    ast: AST.Program,
    name: string,
    refNode: AST.IdentifierExpr,
  ): AST.PatternIdentifier | null {
    let found: AST.PatternIdentifier | null = null;

    const searchPattern = (pattern: AST.Pattern): void => {
      if (pattern.kind === "PatternIdentifier") {
        if (pattern.name === name) {
          found = pattern;
        }
      } else if (pattern.kind === "PatternEnumTuple") {
        // Check if any binding matches the name
        const binding = pattern.bindings.find(
          (b) => b.kind === "PatternIdentifier" && b.name === name,
        );
        if (binding && binding.kind === "PatternIdentifier") {
          found = binding;
        }
      } else if (pattern.kind === "PatternEnumStruct") {
        const field = pattern.fields.find((f) => f.binding === name);
        if (field) {
          found = {
            kind: "PatternIdentifier",
            name: name,
            location: pattern.location,
            type: undefined,
          } as AST.PatternIdentifier;
        }
      }
    };

    const traverse = (node: any): void => {
      if (!node || typeof node !== "object" || found) return;

      // If we found a match expression
      if (node.kind === "Match") {
        const matchExpr = node as AST.MatchExpr;
        for (const arm of matchExpr.arms) {
          // Check if the reference is inside this arm's body
          if (
            arm.location &&
            refNode.location &&
            arm.body &&
            typeof arm.body === "object" &&
            arm.body.location
          ) {
            const armBodyLoc = arm.body.location;
            const refLoc = refNode.location;

            if (
              refLoc.startLine >= armBodyLoc.startLine &&
              refLoc.endLine <= armBodyLoc.endLine
            ) {
              // Reference is in this arm, search its pattern
              searchPattern(arm.pattern);
              if (found) return;
            }
          }
        }
      }

      // Recursively traverse children
      if (Array.isArray(node)) {
        for (const item of node) {
          traverse(item);
        }
      } else {
        for (const key of Object.keys(node)) {
          traverse(node[key]);
        }
      }
    };

    traverse(ast);
    return found;
  }
}
