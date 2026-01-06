import {
  type CallHierarchyIncomingCall,
  type CallHierarchyItem,
  type CallHierarchyOutgoingCall,
  type CallHierarchyPrepareParams,
  Range,
  SymbolKind,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as AST from "../../../compiler/common/AST";
import { ASTResolver } from "./ASTResolver";
import { SymbolIndex } from "./SymbolIndex";

/**
 * Provides call hierarchy support - shows incoming and outgoing calls for functions
 */
export class CallHierarchyProvider {
  constructor(
    private astResolver: ASTResolver,
    private symbolIndex: SymbolIndex,
  ) {}

  /**
   * Prepare call hierarchy - returns the symbol at the position
   */
  prepare(
    params: CallHierarchyPrepareParams,
    document: TextDocument,
  ): CallHierarchyItem[] | null {
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

    // Check if it's a function or method
    const funcDecl = this.findContainingFunction(ast, node);
    if (!funcDecl) return null;

    return [this.createCallHierarchyItem(funcDecl, filePath)];
  }

  /**
   * Get incoming calls - who calls this function
   */
  async getIncomingCalls(
    item: CallHierarchyItem,
  ): Promise<CallHierarchyIncomingCall[]> {
    const incomingCalls: CallHierarchyIncomingCall[] = [];
    const targetFuncName = item.name;
    const _targetUri = item.uri;

    // Search for all references to this function across the workspace
    const allFiles = this.astResolver.getAllCachedFiles();

    for (const filePath of allFiles) {
      const ast = this.astResolver.getCachedAST(filePath);
      if (!ast) continue;

      const calls = this.findCallsToFunction(ast, targetFuncName, filePath);

      for (const call of calls) {
        // Find the containing function that makes this call
        const callerFunc = this.findContainingFunction(ast, call.node);
        if (callerFunc) {
          const _uri = `file://${filePath}`;
          const caller = this.createCallHierarchyItem(callerFunc, filePath);

          incomingCalls.push({
            from: caller,
            fromRanges: [call.range],
          });
        }
      }
    }

    return incomingCalls;
  }

  /**
   * Get outgoing calls - what this function calls
   */
  async getOutgoingCalls(
    item: CallHierarchyItem,
  ): Promise<CallHierarchyOutgoingCall[]> {
    const outgoingCalls: CallHierarchyOutgoingCall[] = [];
    const sourceUri = item.uri.replace("file://", "");

    const ast = this.astResolver.getCachedAST(sourceUri);
    if (!ast) return outgoingCalls;

    // Find the function declaration
    const funcDecl = this.findFunctionByRange(ast, item.selectionRange);
    if (!funcDecl || !funcDecl.body) return outgoingCalls;

    // Find all function calls in this function's body
    const calls = this.findAllCalls(funcDecl.body);

    for (const call of calls) {
      if (call.callee.kind === "Identifier") {
        const calleeName = (call.callee as AST.IdentifierExpr).name;

        // Try to resolve the callee
        const symbol = this.symbolIndex.findSymbol(calleeName);
        if (
          symbol &&
          symbol.length > 0 &&
          symbol[0] &&
          symbol[0].kind === "function"
        ) {
          const calleeItem = this.createCallHierarchyItemFromSymbol(
            symbol,
            calleeName,
          );

          const callRange = this.nodeToRange(call);
          if (callRange) {
            outgoingCalls.push({
              to: calleeItem,
              fromRanges: [callRange],
            });
          }
        }
      } else if (call.callee.kind === "Member") {
        // Handle method calls like obj.method()
        const memberExpr = call.callee as AST.MemberExpr;
        if (typeof memberExpr.property === "string") {
          const methodName = memberExpr.property;

          // Try to find the method in symbol index
          const callRange = this.nodeToRange(call);
          if (callRange) {
            // Create a placeholder item for the method
            const methodItem: CallHierarchyItem = {
              name: methodName,
              kind: SymbolKind.Method,
              uri: item.uri,
              range: callRange,
              selectionRange: callRange,
            };

            outgoingCalls.push({
              to: methodItem,
              fromRanges: [callRange],
            });
          }
        }
      }
    }

    return outgoingCalls;
  }

  /**
   * Find all function calls in a statement
   */
  private findAllCalls(node: AST.Statement | AST.Expression): AST.CallExpr[] {
    const calls: AST.CallExpr[] = [];

    const visit = (n: AST.Statement | AST.Expression) => {
      if (n.kind === "Call") {
        calls.push(n as AST.CallExpr);
      }

      // Recurse into children
      switch (n.kind) {
        case "Block":
          (n as AST.BlockStmt).statements.forEach(visit);
          break;
        case "If":
          const ifStmt = n as AST.IfStmt;
          if (ifStmt.thenBranch) visit(ifStmt.thenBranch);
          if (ifStmt.elseBranch) visit(ifStmt.elseBranch);
          break;
        case "Loop":
          const loop = n as AST.LoopStmt;
          if (loop.body) visit(loop.body);
          break;
        case "ExpressionStmt":
          visit((n as AST.ExpressionStmt).expression);
          break;
        case "Return":
          const ret = n as AST.ReturnStmt;
          if (ret.value) visit(ret.value);
          break;
        case "VariableDecl":
          const varDecl = n as AST.VariableDecl;
          if (varDecl.initializer) visit(varDecl.initializer);
          break;
        case "Binary":
          const binary = n as AST.BinaryExpr;
          visit(binary.left);
          visit(binary.right);
          break;
        case "Call":
          const call = n as AST.CallExpr;
          visit(call.callee);
          call.args.forEach(visit);
          break;
        case "Member":
          visit((n as AST.MemberExpr).object);
          break;
        case "Assignment":
          const assign = n as AST.AssignmentExpr;
          visit(assign.assignee);
          visit(assign.value);
          break;
      }
    };

    visit(node);
    return calls;
  }

  /**
   * Find calls to a specific function
   */
  private findCallsToFunction(
    ast: AST.Program,
    funcName: string,
    _filePath: string,
  ): Array<{ node: AST.CallExpr; range: Range }> {
    const calls: Array<{ node: AST.CallExpr; range: Range }> = [];

    const visitStatement = (stmt: AST.Statement | AST.Expression) => {
      if (stmt.kind === "Call") {
        const call = stmt as AST.CallExpr;
        if (
          call.callee.kind === "Identifier" &&
          (call.callee as AST.IdentifierExpr).name === funcName
        ) {
          const range = this.nodeToRange(call);
          if (range) {
            calls.push({ node: call, range });
          }
        }
      }

      // Recurse through the AST
      switch (stmt.kind) {
        case "FunctionDecl":
          const func = stmt as AST.FunctionDecl;
          if (func.body) {
            func.body.statements.forEach(visitStatement);
          }
          break;
        case "Block":
          (stmt as AST.BlockStmt).statements.forEach(visitStatement);
          break;
        case "If":
          const ifStmt = stmt as AST.IfStmt;
          if (ifStmt.thenBranch) visitStatement(ifStmt.thenBranch);
          if (ifStmt.elseBranch) visitStatement(ifStmt.elseBranch);
          break;
        case "Loop":
          const loop = stmt as AST.LoopStmt;
          if (loop.body) visitStatement(loop.body);
          break;
        case "ExpressionStmt":
          visitStatement((stmt as AST.ExpressionStmt).expression);
          break;
        case "Return":
          const ret = stmt as AST.ReturnStmt;
          if (ret.value) visitStatement(ret.value);
          break;
        case "Binary":
          const binary = stmt as AST.BinaryExpr;
          visitStatement(binary.left);
          visitStatement(binary.right);
          break;
        case "Call":
          const call = stmt as AST.CallExpr;
          visitStatement(call.callee);
          call.args.forEach(visitStatement);
          break;
      }
    };

    ast.statements.forEach(visitStatement);
    return calls;
  }

  /**
   * Find the function containing a node
   */
  private findContainingFunction(
    ast: AST.Program,
    node: AST.ASTNode,
  ): AST.FunctionDecl | null {
    if (!node.location) return null;

    const targetLine = node.location.startLine;
    const targetCol = node.location.startColumn;

    for (const stmt of ast.statements) {
      if (stmt.kind === "FunctionDecl") {
        const func = stmt as AST.FunctionDecl;
        if (
          func.body &&
          this.rangeContainsPosition(func.body, targetLine, targetCol)
        ) {
          return func;
        }
      } else if (stmt.kind === "StructDecl") {
        const struct = stmt as AST.StructDecl;
        for (const member of struct.members) {
          if (member.kind === "FunctionDecl") {
            const method = member as AST.FunctionDecl;
            if (
              method.body &&
              this.rangeContainsPosition(method.body, targetLine, targetCol)
            ) {
              return method;
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * Find function by its range
   */
  private findFunctionByRange(
    ast: AST.Program,
    range: Range,
  ): AST.FunctionDecl | null {
    for (const stmt of ast.statements) {
      if (stmt.kind === "FunctionDecl") {
        const func = stmt as AST.FunctionDecl;
        const funcRange = this.nodeToRange(func);
        if (funcRange && this.rangesEqual(funcRange, range)) {
          return func;
        }
      }
    }
    return null;
  }

  /**
   * Create call hierarchy item from function declaration
   */
  private createCallHierarchyItem(
    funcDecl: AST.FunctionDecl,
    filePath: string,
  ): CallHierarchyItem {
    const range = this.nodeToRange(funcDecl);
    const selectionRange = range || Range.create(0, 0, 0, 0);

    return {
      name: funcDecl.name,
      kind: SymbolKind.Function,
      uri: `file://${filePath}`,
      range: selectionRange,
      selectionRange: selectionRange,
    };
  }

  /**
   * Create call hierarchy item from symbol
   */
  private createCallHierarchyItemFromSymbol(
    symbol: any,
    name: string,
  ): CallHierarchyItem {
    const filePath = symbol.filePath || "";
    const uri = `file://${filePath}`;

    // Try to get range from symbol location
    let range = Range.create(0, 0, 0, 0);
    if (symbol.location) {
      range = Range.create(
        symbol.location.startLine - 1,
        symbol.location.startColumn - 1,
        symbol.location.endLine - 1,
        symbol.location.endColumn - 1,
      );
    }

    return {
      name: name,
      kind: SymbolKind.Function,
      uri: uri,
      range: range,
      selectionRange: range,
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

  /**
   * Check if a range contains a position
   */
  private rangeContainsPosition(
    node: AST.ASTNode,
    line: number,
    col: number,
  ): boolean {
    if (!node.location) return false;
    const loc = node.location;

    const startLine = loc.startLine ?? 1;
    const startCol = loc.startColumn ?? 1;
    const endLine = loc.endLine ?? startLine;
    const endCol = loc.endColumn ?? startCol;

    if (line < startLine || line > endLine) return false;
    if (line === startLine && col < startCol) return false;
    if (line === endLine && col > endCol) return false;

    return true;
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
}
