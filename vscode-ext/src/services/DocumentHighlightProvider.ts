import {
  type DocumentHighlightParams,
  DocumentHighlight,
  DocumentHighlightKind,
  Range,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as AST from "../../../compiler/common/AST";
import { ASTResolver } from "./ASTResolver";

/**
 * Provides document highlights - highlights all occurrences of the symbol under cursor.
 * Gives instant visual feedback for variable/function usage.
 */
export class DocumentHighlightProvider {
  constructor(private astResolver: ASTResolver) {}

  /**
   * Handle document highlight request
   */
  handle(
    params: DocumentHighlightParams,
    document: TextDocument,
  ): DocumentHighlight[] | null {
    const filePath = document.uri.replace("file://", "");
    const content = document.getText();
    const position = params.position;

    // Parse document
    this.astResolver.parseDocumentContent(filePath, content);
    const ast = this.astResolver.getCachedAST(filePath);
    if (!ast) return null;

    const line = position.line + 1; // AST uses 1-based
    const char = position.character + 1;

    // Find the identifier at cursor by searching all statements
    let identifier: AST.IdentifierExpr | null = null;
    for (const stmt of ast.statements) {
      identifier = this.findIdentifierAtPosition(stmt, line, char);
      if (identifier) break;
    }
    if (!identifier) return null;

    const symbolName = identifier.name;

    // Find all references to this symbol in the document
    const highlights: DocumentHighlight[] = [];

    // Check if it's a declaration or reference
    const isDeclaration = this.isDeclarationNode(identifier, ast, line, char);

    // Find all usages in all statements
    for (const stmt of ast.statements) {
      this.findAllUsages(stmt, symbolName, highlights, isDeclaration);
    }

    return highlights.length > 0 ? highlights : null;
  }

  /**
   * Find identifier node at position
   */
  private findIdentifierAtPosition(
    node: AST.Statement | AST.Expression,
    line: number,
    char: number,
  ): AST.IdentifierExpr | null {
    if (!this.nodeContainsPosition(node, line, char)) {
      return null;
    }

    // If this is an identifier, return it
    if (node.kind === "Identifier") {
      return node as AST.IdentifierExpr;
    }

    // Also check member expressions (property is a string, not a node)
    // Member access highlighting would require more complex logic

    // Recursively search children
    const children = this.getChildNodes(node);
    for (const child of children) {
      const result = this.findIdentifierAtPosition(child, line, char);
      if (result) return result;
    }

    return null;
  }

  /**
   * Check if identifier is at a declaration site
   */
  private isDeclarationNode(
    identifier: AST.IdentifierExpr,
    ast: AST.Program,
    _line: number,
    _char: number,
  ): boolean {
    // Check if this identifier is part of a variable declaration
    for (const stmt of ast.statements) {
      if (stmt.kind === "VariableDecl") {
        const varStmt = stmt as AST.VariableDecl;
        if (varStmt.name === identifier.name) {
          return true;
        }
      }
      if (stmt.kind === "FunctionDecl") {
        const func = stmt as AST.FunctionDecl;
        if (func.name === identifier.name) {
          return true;
        }
        // Check function parameters
        for (const param of func.params) {
          if (param.name === identifier.name) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Find all usages of a symbol
   */
  private findAllUsages(
    node: AST.Statement | AST.Expression,
    symbolName: string,
    highlights: DocumentHighlight[],
    isDeclaration: boolean,
  ): void {
    // Check current node
    if (node.kind === "Identifier") {
      const ident = node as AST.IdentifierExpr;
      if (ident.name === symbolName && ident.location) {
        const kind = isDeclaration
          ? DocumentHighlightKind.Write
          : DocumentHighlightKind.Read;

        highlights.push(
          DocumentHighlight.create(this.locationToRange(ident.location), kind),
        );
      }
    }

    // Check variable declarations
    if (node.kind === "VariableDecl") {
      const varStmt = node as AST.VariableDecl;
      if (varStmt.name === symbolName && varStmt.location) {
        highlights.push(
          DocumentHighlight.create(
            this.locationToRange(varStmt.location),
            DocumentHighlightKind.Write,
          ),
        );
      }
    }

    // Check function declarations
    if (node.kind === "FunctionDecl") {
      const func = node as AST.FunctionDecl;
      if (func.name === symbolName && func.location) {
        highlights.push(
          DocumentHighlight.create(
            this.locationToRange(func.location),
            DocumentHighlightKind.Text,
          ),
        );
      }
    }

    // Recursively check children
    const children = this.getChildNodes(node);
    for (const child of children) {
      this.findAllUsages(child, symbolName, highlights, isDeclaration);
    }
  }

  /**
   * Check if node contains position
   */
  private nodeContainsPosition(
    node: AST.Statement | AST.Expression,
    line: number,
    char: number,
  ): boolean {
    if (!node.location) return false;

    const { startLine, startColumn, endLine, endColumn } = node.location;

    if (line < startLine || line > endLine) return false;
    if (line === startLine && char < startColumn) return false;
    if (line === endLine && char > endColumn) return false;

    return true;
  }

  /**
   * Get child nodes for traversal
   */
  private getChildNodes(
    node: AST.Statement | AST.Expression,
  ): (AST.Statement | AST.Expression)[] {
    const children: (AST.Statement | AST.Expression)[] = [];

    switch (node.kind) {
      case "FunctionDecl":
        const func = node as AST.FunctionDecl;
        if (func.body) children.push(...func.body.statements);
        break;
      case "Block":
        children.push(...(node as AST.BlockStmt).statements);
        break;
      case "If":
        const ifStmt = node as AST.IfStmt;
        children.push(ifStmt.condition, ifStmt.thenBranch);
        if (ifStmt.elseBranch) children.push(ifStmt.elseBranch);
        break;
      case "Loop":
        const loop = node as AST.LoopStmt;
        if (loop.condition) children.push(loop.condition);
        children.push(loop.body);
        break;
      case "Switch":
        const match = node as AST.SwitchStmt;
        children.push(match.expression);
        for (const arm of match.cases) {
          children.push(arm.body);
        }
        break;
      case "VariableDecl":
        const varStmt = node as AST.VariableDecl;
        if (varStmt.initializer) children.push(varStmt.initializer);
        break;
      case "Return":
        const ret = node as AST.ReturnStmt;
        if (ret.value) children.push(ret.value);
        break;
      case "ExpressionStmt":
        children.push((node as AST.ExpressionStmt).expression);
        break;
      case "Binary":
        const binary = node as AST.BinaryExpr;
        children.push(binary.left, binary.right);
        break;
      case "Unary":
        children.push((node as AST.UnaryExpr).operand);
        break;
      case "Call":
        const call = node as AST.CallExpr;
        children.push(call.callee, ...call.args);
        break;
      case "Member":
        children.push((node as AST.MemberExpr).object);
        break;
      case "Index":
        const index = node as AST.IndexExpr;
        children.push(index.object, index.index);
        break;
      case "Assignment":
        const assign = node as AST.AssignmentExpr;
        children.push(assign.assignee, assign.value);
        break;
      case "Try":
        const tryCatch = node as AST.TryStmt;
        children.push(tryCatch.tryBlock);
        for (const catchClause of tryCatch.catchClauses) {
          children.push(catchClause.body);
        }
        if (tryCatch.catchOther) {
          children.push(tryCatch.catchOther);
        }
        break;
    }

    return children;
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
    return Range.create(
      location.startLine - 1,
      location.startColumn - 1,
      location.endLine - 1,
      location.endColumn - 1,
    );
  }
}
