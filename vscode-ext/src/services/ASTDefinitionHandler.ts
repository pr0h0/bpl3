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
import { fileURLToPath } from "url";
import * as AST from "../../../compiler/common/AST";
import { ASTResolver } from "./ASTResolver";
import { SymbolIndex } from "./SymbolIndex";
import { debugLog, filePathToUri } from "./utils";

type DefinitionLocationRange = {
  file?: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
};

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
    document: TextDocument,
  ): Location | null {
    try {
      const filePath = fileURLToPath(params.textDocument.uri);
      debugLog(
        `[ASTDefinition] Definition at ${filePath}:${params.position.line + 1}:${params.position.character + 1}`,
      );

      this.astResolver.parseDocumentContent(filePath, document.getText());

      // Find the AST node at the cursor position
      const node = this.astResolver.findNodeAtPosition(
        filePath,
        params.position.line,
        params.position.character,
      );

      if (!node) {
        debugLog(`[ASTDefinition] No AST node found at position`);
        return null;
      }

      debugLog(`[ASTDefinition] Found node kind: ${node.kind}`);

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
          return this.createLocation(node.location, filePath);

        case "TypeAlias":
        case "StructDecl":
        case "EnumDecl":
        case "SpecDecl":
        case "SpecMethod":
        case "FunctionDecl":
        case "Extern":
        case "VariableDecl":
          // Already at the declaration, stay here
          return this.createLocation(node.location, filePath);

        default:
          debugLog(`[ASTDefinition] Unhandled node kind: ${node.kind}`);
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
    debugLog(`[ASTDefinition] Identifier: ${name}`);

    // Check if there's a resolved declaration
    if (node.resolvedDeclaration && node.resolvedDeclaration.location) {
      const decl = node.resolvedDeclaration;
      debugLog(`[ASTDefinition] Found via resolvedDeclaration`);
      return this.createLocation(decl.location, filePath);
    }

    // Try to find local variable declaration in the same file
    const ast =
      this.astResolver.getCachedAST(filePath) ??
      this.astResolver.getAST(filePath);
    if (ast) {
      debugLog(`[ASTDefinition] Searching AST for local variable: ${name}`);
      const varDecl = this.findVariableDeclaration(ast, name, node);
      if (varDecl && varDecl.location) {
        debugLog(`[ASTDefinition] Found local variable declaration`);
        return this.createLocation(varDecl.location, filePath);
      }

      // Try to find pattern variable
      debugLog(
        `[ASTDefinition] Searching AST for pattern variable: ${name}`,
      );
      const patternVar = this.findPatternVariable(ast, name, node);
      if (patternVar && patternVar.location) {
        debugLog(`[ASTDefinition] Found pattern variable declaration`);
        return this.createLocation(patternVar.location, filePath);
      }
    }

    // Fall back to symbol index
    const symbols = this.symbolIndex.findSymbol(name);
    if (symbols.length > 0) {
      const symbol = symbols[0];
      if (!symbol) return null;

      debugLog(`[ASTDefinition] Found in symbol index: ${name}`);
      return this.createLocation(symbol.location, symbol.filePath);
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
    debugLog(`[ASTDefinition] Member: ${memberName}`);

    // Resolve the type of the object
    const objectType = this.astResolver.resolveType(node.object, filePath);
    if (!objectType) {
      debugLog(`[ASTDefinition] Could not resolve object type`);
      return null;
    }

    debugLog(`[ASTDefinition] Object type: ${objectType}`);

    // Extract base type
    const baseType = objectType
      .replace(/^\*+/, "")
      .replace(/\[\]$/, "")
      .replace(/<.*>/, "");

    // Look up the type in symbol index
    const symbols = this.symbolIndex.findSymbol(baseType);
    if (symbols.length === 0) {
      debugLog(`[ASTDefinition] Type not found: ${baseType}`);
      return null;
    }

    for (const symbol of symbols) {
      // Check methods
      if (symbol.methods) {
        const method = symbol.methods.find((m) => m.name === memberName);
        if (method) {
          debugLog(`[ASTDefinition] Found method: ${memberName}`);
          return this.createLocation(method.location, symbol.filePath);
        }
      }

      // Check fields - go to struct definition
      if (symbol.fields) {
        const field = symbol.fields.find((f) => f.name === memberName);
        if (field) {
          debugLog(`[ASTDefinition] Found field: ${memberName}`);
          // Fields don't have location, so go to struct
          return this.createLocation(symbol.location, symbol.filePath);
        }
      }

      // Check enum variants
      if (symbol.variants) {
        const variant = symbol.variants.find((v) => v.name === memberName);
        if (variant) {
          debugLog(`[ASTDefinition] Found enum variant: ${memberName}`);
          // Variants don't have location, go to enum
          return this.createLocation(symbol.location, symbol.filePath);
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
    debugLog(`[ASTDefinition] Call expression`);

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
    debugLog(`[ASTDefinition] BasicType: ${typeName}`);

    // Check if there's a resolved declaration
    if (node.resolvedDeclaration && node.resolvedDeclaration.location) {
      const decl = node.resolvedDeclaration;
      return this.createLocation(decl.location, filePath);
    }

    // Fall back to symbol index
    const symbols = this.symbolIndex.findSymbol(typeName);
    if (symbols.length > 0) {
      const symbol = symbols[0];
      if (!symbol) return null;

      debugLog(`[ASTDefinition] Found type in symbol index: ${typeName}`);

      return this.createLocation(symbol.location, symbol.filePath);
    }

    debugLog(`[ASTDefinition] Type not found: ${typeName}`);
    return null;
  }

  private createLocation(
    location: DefinitionLocationRange,
    fallbackFilePath: string,
  ): Location {
    return Location.create(
      filePathToUri(location.file || fallbackFilePath),
      Range.create(
        {
          line: location.startLine - 1,
          character: location.startColumn - 1,
        },
        {
          line: location.endLine - 1,
          character: location.endColumn - 1,
        },
      ),
    );
  }

  /**
   * Find a variable declaration in the AST by name
   */
  private findVariableDeclaration(
    ast: AST.Program,
    name: string,
    beforeNode: AST.ASTNode,
  ): AST.VariableDecl | null {
    for (const stmt of ast.statements) {
      if (stmt.kind === "VariableDecl") {
        if (stmt.name === name && this.declarationPrecedes(stmt, beforeNode)) {
          return stmt;
        }
      } else if (stmt.kind === "FunctionDecl") {
        if (this.isNodeContainedIn(beforeNode, stmt)) {
          return this.findVariableInFunction(stmt, name, beforeNode);
        }
      } else if (stmt.kind === "StructDecl") {
        for (const member of stmt.members) {
          if (
            member.kind === "FunctionDecl" &&
            this.isNodeContainedIn(beforeNode, member)
          ) {
            return this.findVariableInFunction(member, name, beforeNode);
          }
        }
      } else if (stmt.kind === "EnumDecl") {
        for (const method of stmt.methods) {
          if (this.isNodeContainedIn(beforeNode, method)) {
            return this.findVariableInFunction(method, name, beforeNode);
          }
        }
      }
    }

    return null;
  }

  private findVariableInFunction(
    funcNode: AST.FunctionDecl,
    name: string,
    beforeNode: AST.ASTNode,
  ): AST.VariableDecl | null {
    if (!funcNode.body) return null;
    return this.findVariableInBlock(funcNode.body, name, beforeNode);
  }

  private findVariableInBlock(
    block: AST.BlockStmt,
    name: string,
    beforeNode: AST.ASTNode,
  ): AST.VariableDecl | null {
    for (const stmt of block.statements) {
      if (
        stmt.location &&
        beforeNode.location &&
        stmt.location.startLine > beforeNode.location.startLine
      ) {
        break;
      }

      if (stmt.kind === "VariableDecl") {
        if (stmt.name === name && this.declarationPrecedes(stmt, beforeNode)) {
          return stmt;
        }
      } else if (
        stmt.kind === "Block" &&
        this.isNodeContainedIn(beforeNode, stmt)
      ) {
        const found = this.findVariableInBlock(stmt, name, beforeNode);
        if (found) return found;
      } else if (stmt.kind === "If") {
        if (
          stmt.thenBranch?.kind === "Block" &&
          this.isNodeContainedIn(beforeNode, stmt.thenBranch)
        ) {
          const found = this.findVariableInBlock(
            stmt.thenBranch,
            name,
            beforeNode,
          );
          if (found) return found;
        }
        if (
          stmt.elseBranch?.kind === "Block" &&
          this.isNodeContainedIn(beforeNode, stmt.elseBranch)
        ) {
          const found = this.findVariableInBlock(
            stmt.elseBranch,
            name,
            beforeNode,
          );
          if (found) return found;
        }
      } else if (
        stmt.kind === "Loop" &&
        stmt.body?.kind === "Block" &&
        this.isNodeContainedIn(beforeNode, stmt.body)
      ) {
        const found = this.findVariableInBlock(stmt.body, name, beforeNode);
        if (found) return found;
      } else if (stmt.kind === "Switch") {
        for (const switchCase of stmt.cases) {
          if (this.isNodeContainedIn(beforeNode, switchCase.body)) {
            const found = this.findVariableInBlock(
              switchCase.body,
              name,
              beforeNode,
            );
            if (found) return found;
          }
        }
        if (
          stmt.defaultCase &&
          this.isNodeContainedIn(beforeNode, stmt.defaultCase)
        ) {
          const found = this.findVariableInBlock(
            stmt.defaultCase,
            name,
            beforeNode,
          );
          if (found) return found;
        }
      } else if (stmt.kind === "Try") {
        if (this.isNodeContainedIn(beforeNode, stmt.tryBlock)) {
          const found = this.findVariableInBlock(
            stmt.tryBlock,
            name,
            beforeNode,
          );
          if (found) return found;
        }
        for (const catchClause of stmt.catchClauses) {
          if (this.isNodeContainedIn(beforeNode, catchClause.body)) {
            const catchVariable = this.catchClauseVariableDecl(catchClause);
            if (catchVariable?.name === name) {
              return catchVariable;
            }
            const found = this.findVariableInBlock(
              catchClause.body,
              name,
              beforeNode,
            );
            if (found) return found;
          }
        }
      } else if (
        stmt.kind === "Defer" &&
        stmt.statement.kind === "Block" &&
        this.isNodeContainedIn(beforeNode, stmt.statement)
      ) {
        const found = this.findVariableInBlock(
          stmt.statement,
          name,
          beforeNode,
        );
        if (found) return found;
      }
    }

    return null;
  }

  private catchClauseVariableDecl(
    catchClause: AST.CatchClause,
  ): AST.VariableDecl | null {
    if (!catchClause.variable) return null;

    return {
      kind: "VariableDecl",
      isGlobal: false,
      isConst: false,
      name: catchClause.variable,
      typeAnnotation: catchClause.type ?? undefined,
      location: catchClause.location,
    };
  }

  private declarationPrecedes(
    declaration: AST.VariableDecl,
    beforeNode: AST.ASTNode,
  ): boolean {
    return (
      !!declaration.location &&
      !!beforeNode.location &&
      (declaration.location.startLine < beforeNode.location.startLine ||
        (declaration.location.startLine === beforeNode.location.startLine &&
          declaration.location.startColumn < beforeNode.location.startColumn))
    );
  }

  private isNodeContainedIn(
    node: AST.ASTNode,
    container: AST.ASTNode,
  ): boolean {
    if (!node.location || !container.location) return false;
    return (
      node.location.startLine >= container.location.startLine &&
      node.location.endLine <= container.location.endLine &&
      (node.location.startLine > container.location.startLine ||
        node.location.startColumn >= container.location.startColumn) &&
      (node.location.endLine < container.location.endLine ||
        node.location.endColumn <= container.location.endColumn)
    );
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
