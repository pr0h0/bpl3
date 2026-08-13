import {
  type DocumentHighlightParams,
  DocumentHighlight,
  DocumentHighlightKind,
  Range,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { fileURLToPath } from "url";
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
    const filePath = fileURLToPath(document.uri);
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
    node: AST.ASTNode,
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

    if (node.kind === "PatternIdentifier") {
      const pattern = node as AST.PatternIdentifier;
      return {
        kind: "Identifier",
        name: pattern.name,
        location: pattern.location,
      };
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
    node: AST.ASTNode,
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

    if (node.kind === "CatchClause") {
      const catchClause = node as AST.CatchClause;
      if (catchClause.variable === symbolName && catchClause.location) {
        highlights.push(
          DocumentHighlight.create(
            this.locationToRange(catchClause.location),
            DocumentHighlightKind.Write,
          ),
        );
      }
    }

    if (node.kind === "PatternIdentifier") {
      const pattern = node as AST.PatternIdentifier;
      if (pattern.name === symbolName && pattern.location) {
        highlights.push(
          DocumentHighlight.create(
            this.locationToRange(pattern.location),
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
    node: AST.ASTNode,
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
  private getChildNodes(node: AST.ASTNode): AST.ASTNode[] {
    const children: AST.ASTNode[] = [];

    switch (node.kind) {
      case "FunctionDecl":
        const func = node as AST.FunctionDecl;
        if (func.body) children.push(...func.body.statements);
        break;
      case "StructDecl":
        const struct = node as AST.StructDecl;
        for (const member of struct.members) {
          if (member.kind === "FunctionDecl") {
            children.push(member);
          }
        }
        break;
      case "EnumDecl":
        children.push(...(node as AST.EnumDecl).methods);
        break;
      case "SpecDecl":
        children.push(...(node as AST.SpecDecl).methods);
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
        if (loop.init) children.push(loop.init);
        if (loop.condition) children.push(loop.condition);
        if (loop.step) children.push(loop.step);
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
      case "Ternary":
        const ternary = node as AST.TernaryExpr;
        children.push(ternary.condition, ternary.trueExpr, ternary.falseExpr);
        break;
      case "Unary":
        children.push((node as AST.UnaryExpr).operand);
        break;
      case "Is":
        children.push((node as AST.IsExpr).expression);
        break;
      case "As":
        children.push((node as AST.AsExpr).expression);
        break;
      case "Cast":
        children.push((node as AST.CastExpr).expression);
        break;
      case "Sizeof": {
        const target = (node as AST.SizeofExpr).target;
        if ((target as AST.ASTNode).kind) children.push(target as AST.ASTNode);
        break;
      }
      case "TypeOf": {
        const target = (node as AST.TypeOfExpr).target;
        if ((target as AST.ASTNode).kind) children.push(target as AST.ASTNode);
        break;
      }
      case "TypeMatch": {
        const value = (node as AST.TypeMatchExpr).value;
        if ((value as AST.ASTNode).kind) children.push(value as AST.ASTNode);
        break;
      }
      case "Group":
      case "Grouped":
        children.push((node as AST.GroupExpr).expression);
        break;
      case "ArrayLiteral":
        children.push(...(node as AST.ArrayLiteralExpr).elements);
        break;
      case "TupleLiteral":
        children.push(...(node as AST.TupleLiteralExpr).elements);
        break;
      case "StructLiteral":
        for (const field of (node as AST.StructLiteralExpr).fields) {
          children.push(field.value);
        }
        break;
      case "EnumStructVariant":
        for (const field of (node as AST.EnumStructVariantExpr).fields) {
          children.push(field.value);
        }
        break;
      case "InterpolatedString":
        children.push(...(node as AST.InterpolatedStringExpr).parts);
        break;
      case "GenericInstantiation":
        children.push((node as AST.GenericInstantiationExpr).base);
        break;
      case "LambdaExpression":
        children.push(...(node as AST.LambdaExpr).params);
        children.push((node as AST.LambdaExpr).body);
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
        children.push(...tryCatch.catchClauses);
        break;
      case "CatchClause":
        children.push((node as AST.CatchClause).body);
        break;
      case "Match":
        const matchExpr = node as AST.MatchExpr;
        children.push(matchExpr.value);
        for (const arm of matchExpr.arms) {
          children.push(arm.pattern);
          if (arm.guard) children.push(arm.guard);
          children.push(arm.body);
        }
        break;
      case "MatchArm":
        const arm = node as AST.MatchArm;
        children.push(arm.pattern);
        if (arm.guard) children.push(arm.guard);
        children.push(arm.body);
        break;
      case "PatternLiteral":
        children.push((node as AST.PatternLiteral).value);
        break;
      case "PatternTuple":
        children.push(...(node as AST.PatternTuple).patterns);
        break;
      case "PatternEnumTuple":
        children.push(...(node as AST.PatternEnumTuple).bindings);
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
