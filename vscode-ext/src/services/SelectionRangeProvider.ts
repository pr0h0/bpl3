import {
  type SelectionRangeParams,
  Position,
  Range,
  SelectionRange,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as AST from "../../../compiler/common/AST";
import { ASTResolver } from "./ASTResolver";

/**
 * Provides smart selection ranges based on AST structure.
 * Allows users to progressively expand/shrink selection to encompass larger syntactic units.
 */
export class SelectionRangeProvider {
  constructor(private astResolver: ASTResolver) {}

  /**
   * Handle selection range request
   */
  handle(
    params: SelectionRangeParams,
    document: TextDocument,
  ): SelectionRange[] | null {
    const filePath = document.uri.replace("file://", "");
    const content = document.getText();

    // Parse document
    this.astResolver.parseDocumentContent(filePath, content);
    const ast = this.astResolver.getCachedAST(filePath);
    if (!ast) return null;

    const results: SelectionRange[] = [];

    for (const position of params.positions) {
      console.log(
        `[SelectionRange] Request for position ${position.line}:${position.character}`,
      );
      const selectionRange = this.getSelectionRange(ast, position);
      if (selectionRange) {
        console.log(`[SelectionRange] Generated selection hierarchy:`);
        let current: SelectionRange | undefined = selectionRange;
        let depth = 0;
        while (current) {
          const r = current.range;
          console.log(
            `[SelectionRange]   ${depth}: [${r.start.line}:${r.start.character} - ${r.end.line}:${r.end.character}]`,
          );
          current = current.parent;
          depth++;
        }
        results.push(selectionRange);
      } else {
        console.log(`[SelectionRange] No selection range found`);
      }
    }

    return results.length > 0 ? results : null;
  }

  /**
   * Get selection range at position
   */
  private getSelectionRange(
    ast: AST.Program,
    position: Position,
  ): SelectionRange | null {
    const line = position.line + 1; // AST uses 1-based
    const char = position.character + 1;

    console.log(
      `[SelectionRange] Looking for nodes at ${line}:${char} (1-based)`,
    );

    // Collect all nodes that contain this position
    const allContainingNodes: (AST.Statement | AST.Expression)[] = [];

    for (const stmt of ast.statements) {
      if (this.nodeContainsPosition(stmt, line, char)) {
        console.log(
          `[SelectionRange] Found containing statement: ${stmt.kind}`,
        );
        const nodes = this.findContainingNodes(stmt, line, char);
        console.log(
          `[SelectionRange] Collected ${nodes.length} containing nodes:`,
        );
        nodes.forEach((n, i) => {
          const loc = n.location;
          if (loc) {
            console.log(
              `[SelectionRange]   ${i}: ${n.kind} [${loc.startLine}:${loc.startColumn} - ${loc.endLine}:${loc.endColumn}]`,
            );
          } else {
            console.log(`[SelectionRange]   ${i}: ${n.kind} [no location]`);
          }
        });
        allContainingNodes.push(...nodes);
        break; // Found the containing statement
      }
    }

    if (allContainingNodes.length === 0) {
      console.log(`[SelectionRange] No containing nodes found`);
      return null;
    }

    // Build nested selection ranges from OUTERMOST to INNERMOST
    // This way each range's parent points to the next larger scope
    let parent: SelectionRange | undefined;
    let rangeCount = 0;

    // First add document as outermost
    if (ast.location) {
      const docRange = this.nodeToRange(ast as any);
      if (docRange) {
        parent = SelectionRange.create(docRange, undefined);
        console.log(
          `[SelectionRange] Adding range ${rangeCount} for Document: [${docRange.start.line}:${docRange.start.character} - ${docRange.end.line}:${docRange.end.character}]`,
        );
        rangeCount++;
      }
    }

    // Then add nodes from outermost to innermost
    for (let i = allContainingNodes.length - 1; i >= 0; i--) {
      const node = allContainingNodes[i];
      if (!node) continue;
      const range = this.nodeToRange(node);
      if (range) {
        // Skip if this range is identical to the previous one
        if (parent && this.rangesEqual(parent.range, range)) {
          console.log(
            `[SelectionRange] Skipping duplicate range for ${node.kind}`,
          );
          continue;
        }
        console.log(
          `[SelectionRange] Adding range ${rangeCount} for ${node.kind}: [${range.start.line}:${range.start.character} - ${range.end.line}:${range.end.character}]`,
        );
        parent = SelectionRange.create(range, parent);
        rangeCount++;
      }
    }

    console.log(`[SelectionRange] Total ranges in hierarchy: ${rangeCount}`);
    return parent || null;
  }

  /**
   * Check if two ranges are equal
   */
  private rangesEqual(r1: Range, r2: Range): boolean {
    return (
      r1.start.line === r2.start.line &&
      r1.start.character === r2.start.character &&
      r1.end.line === r2.end.line &&
      r1.end.character === r2.end.character
    );
  }

  /**
   * Find all nodes that contain the given position (innermost to outermost)
   */
  private findContainingNodes(
    node: AST.Statement | AST.Expression,
    line: number,
    char: number,
  ): (AST.Statement | AST.Expression)[] {
    if (!this.nodeContainsPosition(node, line, char)) {
      return [];
    }

    console.log(`[SelectionRange]   Checking ${node.kind} for children`);
    // Recursively check children first to get innermost nodes
    const children = this.getChildNodes(node);
    console.log(
      `[SelectionRange]     ${node.kind} has ${children.length} children`,
    );

    for (const child of children) {
      if (child && this.nodeContainsPosition(child, line, char)) {
        console.log(
          `[SelectionRange]     Child ${child.kind} contains position, recursing`,
        );
        const childResults = this.findContainingNodes(child, line, char);
        // Return child results + current node
        return [...childResults, node];
      }
    }

    // No children contain the position, so this is the innermost node
    console.log(`[SelectionRange]     ${node.kind} is leaf node (innermost)`);
    return [node];
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

    const loc = node.location;
    const startLine = loc.startLine ?? 1;
    const startColumn = loc.startColumn ?? 1;
    const endLine = loc.endLine ?? startLine;
    const endColumn = loc.endColumn ?? startColumn;

    // Check if position is within node bounds
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
        // Add the body block itself as a scope, then its statements
        if (func.body) {
          children.push(func.body);
        }
        break;

      case "StructDecl":
        const structMembers = (node as AST.StructDecl).members;
        for (const member of structMembers) {
          if (member.kind === "FunctionDecl") {
            children.push(member);
          }
        }
        break;

      case "Block":
        const block = node as AST.BlockStmt;
        children.push(...block.statements);
        break;

      case "If":
        const ifStmt = node as AST.IfStmt;
        if (ifStmt.condition) children.push(ifStmt.condition);
        if (ifStmt.thenBranch) children.push(ifStmt.thenBranch);
        if (ifStmt.elseBranch) children.push(ifStmt.elseBranch);
        break;

      case "Loop":
        const loop = node as AST.LoopStmt;
        if (loop.condition) children.push(loop.condition);
        if (loop.body) children.push(loop.body);
        break;

      case "Switch":
        const switchStmt = node as AST.SwitchStmt;
        for (const c of switchStmt.cases) {
          if (c.body) children.push(c.body);
        }
        if (switchStmt.defaultCase) {
          children.push(switchStmt.defaultCase);
        }
        break;

      case "VariableDecl":
        const varDecl = node as AST.VariableDecl;
        if (varDecl.initializer) {
          children.push(varDecl.initializer);
        }
        break;

      case "Return":
        const ret = node as AST.ReturnStmt;
        if (ret.value) children.push(ret.value);
        break;

      case "ExpressionStmt":
        const exprStmt = node as AST.ExpressionStmt;
        children.push(exprStmt.expression);
        break;

      case "Binary":
        const binary = node as AST.BinaryExpr;
        children.push(binary.left, binary.right);
        break;

      case "Unary":
        const unary = node as AST.UnaryExpr;
        children.push(unary.operand);
        break;

      case "Call":
        const call = node as AST.CallExpr;
        children.push(call.callee, ...call.args);
        break;

      case "Member":
        const member = node as AST.MemberExpr;
        children.push(member.object);
        break;

      case "Index":
        const index = node as AST.IndexExpr;
        children.push(index.object, index.index);
        break;

      case "Assignment":
        children.push(
          (node as AST.AssignmentExpr).assignee,
          (node as AST.AssignmentExpr).value,
        );
        break;

      case "Try":
        const tryStmt = node as AST.TryStmt;
        if (tryStmt.tryBlock) children.push(tryStmt.tryBlock);
        children.push(...tryStmt.catchClauses.map((c) => c.body));
        break;

      case "Match":
        const matchExpr = node as AST.MatchExpr;
        // Add the scrutinee (the value being matched)
        if (matchExpr.value) children.push(matchExpr.value);
        // Add each match arm's body
        for (const arm of matchExpr.arms) {
          if (arm.guard) children.push(arm.guard);
          if (arm.body) children.push(arm.body);
        }
        break;

      // Add more cases as needed
    }

    return children;
  }

  /**
   * Convert AST node to LSP Range
   */
  private nodeToRange(node: AST.Statement | AST.Expression): Range | null {
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
