import {
  type CallHierarchyIncomingCall,
  type CallHierarchyItem,
  type CallHierarchyOutgoingCall,
  type CallHierarchyPrepareParams,
  Range,
  SymbolKind,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { fileURLToPath } from "url";
import * as AST from "../../../compiler/common/AST";
import { ASTResolver } from "./ASTResolver";
import { SymbolIndex, type SymbolInfo } from "./SymbolIndex";
import { filePathToUri } from "./utils";

type CallableDecl = AST.FunctionDecl | AST.SpecMethod;

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
    const incomingCalls = new Map<string, CallHierarchyIncomingCall>();
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
          const caller = this.createCallHierarchyItem(callerFunc, filePath);
          const key = this.callHierarchyItemKey(caller);
          const existing = incomingCalls.get(key);

          if (existing) {
            existing.fromRanges.push(call.range);
          } else {
            incomingCalls.set(key, {
              from: caller,
              fromRanges: [call.range],
            });
          }
        }
      }
    }

    return [...incomingCalls.values()];
  }

  /**
   * Get outgoing calls - what this function calls
   */
  async getOutgoingCalls(
    item: CallHierarchyItem,
  ): Promise<CallHierarchyOutgoingCall[]> {
    const outgoingCalls: CallHierarchyOutgoingCall[] = [];
    const sourceUri = fileURLToPath(item.uri);

    const ast = this.astResolver.getCachedAST(sourceUri);
    if (!ast) return outgoingCalls;

    // Find the function declaration
    const funcDecl = this.findFunctionByRange(ast, item.selectionRange);
    if (funcDecl?.kind !== "FunctionDecl" || !funcDecl.body) {
      return outgoingCalls;
    }

    // Find all function calls in this function's body
    const calls = this.findAllCalls(funcDecl.body);

    for (const call of calls) {
      if (call.callee.kind === "Identifier") {
        const calleeName = (call.callee as AST.IdentifierExpr).name;

        const cachedFunc = this.findFunctionInWorkspace(calleeName);
        if (cachedFunc) {
          const callRange = this.nodeToRange(call);
          if (callRange) {
            outgoingCalls.push({
              to: this.createCallHierarchyItem(
                cachedFunc.decl,
                cachedFunc.filePath,
              ),
              fromRanges: [callRange],
            });
          }
          continue;
        }

        // Try to resolve the callee
        const symbols = this.symbolIndex.findSymbol(calleeName);
        if (
          symbols &&
          symbols.length > 0 &&
          symbols[0] &&
          symbols[0].kind === "function"
        ) {
          const calleeItem = this.createCallHierarchyItemFromSymbol(
            symbols[0],
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
  private findAllCalls(node: AST.ASTNode): AST.CallExpr[] {
    const calls: AST.CallExpr[] = [];

    const visit = (n: AST.ASTNode) => {
      if (n.kind === "Call") {
        calls.push(n as AST.CallExpr);
      }

      for (const child of this.getChildNodes(n)) {
        visit(child);
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

    for (const call of this.findAllCalls(ast)) {
      const callsTarget =
        (call.callee.kind === "Identifier" &&
          (call.callee as AST.IdentifierExpr).name === funcName) ||
        (call.callee.kind === "Member" &&
          (call.callee as AST.MemberExpr).property === funcName);

      if (callsTarget) {
        const range = this.nodeToRange(call);
        if (range) {
          calls.push({ node: call, range });
        }
      }
    }

    return calls;
  }

  private getChildNodes(node: AST.ASTNode): AST.ASTNode[] {
    const children: AST.ASTNode[] = [];

    switch (node.kind) {
      case "Program":
        children.push(...(node as AST.Program).statements);
        break;
      case "FunctionDecl": {
        const func = node as AST.FunctionDecl;
        if (func.body) children.push(func.body);
        break;
      }
      case "StructDecl":
        children.push(...(node as AST.StructDecl).members);
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
      case "If": {
        const ifStmt = node as AST.IfStmt;
        children.push(ifStmt.condition, ifStmt.thenBranch);
        if (ifStmt.elseBranch) children.push(ifStmt.elseBranch);
        break;
      }
      case "Loop": {
        const loop = node as AST.LoopStmt;
        if (loop.init) children.push(loop.init);
        if (loop.condition) children.push(loop.condition);
        if (loop.step) children.push(loop.step);
        children.push(loop.body);
        break;
      }
      case "Switch": {
        const switchStmt = node as AST.SwitchStmt;
        children.push(switchStmt.expression, ...switchStmt.cases);
        if (switchStmt.defaultCase) children.push(switchStmt.defaultCase);
        break;
      }
      case "Case": {
        const switchCase = node as AST.SwitchCase;
        children.push(switchCase.value, switchCase.body);
        break;
      }
      case "Defer":
        children.push((node as AST.DeferStmt).statement);
        break;
      case "Try": {
        const tryStmt = node as AST.TryStmt;
        children.push(tryStmt.tryBlock, ...tryStmt.catchClauses);
        break;
      }
      case "CatchClause":
        children.push((node as AST.CatchClause).body);
        break;
      case "Throw":
        children.push((node as AST.ThrowStmt).expression);
        break;
      case "VariableDecl": {
        const varDecl = node as AST.VariableDecl;
        if (varDecl.initializer) children.push(varDecl.initializer);
        break;
      }
      case "Return": {
        const ret = node as AST.ReturnStmt;
        if (ret.value) children.push(ret.value);
        break;
      }
      case "ExpressionStmt":
        children.push((node as AST.ExpressionStmt).expression);
        break;
      case "Assignment": {
        const assignment = node as AST.AssignmentExpr;
        children.push(assignment.assignee, assignment.value);
        break;
      }
      case "Binary": {
        const binary = node as AST.BinaryExpr;
        children.push(binary.left, binary.right);
        break;
      }
      case "Ternary": {
        const ternary = node as AST.TernaryExpr;
        children.push(ternary.condition, ternary.trueExpr, ternary.falseExpr);
        break;
      }
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
      case "Index": {
        const index = node as AST.IndexExpr;
        children.push(index.object, index.index);
        break;
      }
      case "Call": {
        const call = node as AST.CallExpr;
        children.push(call.callee, ...call.args);
        break;
      }
      case "Member":
        children.push((node as AST.MemberExpr).object);
        break;
      case "Match": {
        const match = node as AST.MatchExpr;
        children.push(match.value);
        for (const arm of match.arms) {
          children.push(arm.pattern);
          if (arm.guard) children.push(arm.guard);
          children.push(arm.body);
        }
        break;
      }
      case "MatchArm": {
        const arm = node as AST.MatchArm;
        children.push(arm.pattern);
        if (arm.guard) children.push(arm.guard);
        children.push(arm.body);
        break;
      }
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
   * Find the function containing a node
   */
  private findContainingFunction(
    ast: AST.Program,
    node: AST.ASTNode,
  ): CallableDecl | null {
    if (!node.location) return null;

    const targetLine = node.location.startLine;
    const targetCol = node.location.startColumn;

    for (const stmt of ast.statements) {
      if (stmt.kind === "FunctionDecl") {
        const func = stmt as AST.FunctionDecl;
        if (this.rangeContainsPosition(func, targetLine, targetCol)) {
          return func;
        }
      } else if (stmt.kind === "StructDecl") {
        const struct = stmt as AST.StructDecl;
        for (const member of struct.members) {
          if (member.kind === "FunctionDecl") {
            const method = member as AST.FunctionDecl;
            if (this.rangeContainsPosition(method, targetLine, targetCol)) {
              return method;
            }
          }
        }
      } else if (stmt.kind === "EnumDecl") {
        for (const method of (stmt as AST.EnumDecl).methods) {
          if (this.rangeContainsPosition(method, targetLine, targetCol)) {
            return method;
          }
        }
      } else if (stmt.kind === "SpecDecl") {
        for (const method of (stmt as AST.SpecDecl).methods) {
          if (this.rangeContainsPosition(method, targetLine, targetCol)) {
            return method;
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
  ): CallableDecl | null {
    for (const stmt of ast.statements) {
      if (stmt.kind === "FunctionDecl") {
        const func = stmt as AST.FunctionDecl;
        const funcRange = this.nodeToRange(func);
        if (funcRange && this.rangesEqual(funcRange, range)) {
          return func;
        }
      } else if (stmt.kind === "StructDecl") {
        const struct = stmt as AST.StructDecl;
        for (const member of struct.members) {
          if (member.kind === "FunctionDecl") {
            const method = member as AST.FunctionDecl;
            const methodRange = this.nodeToRange(method);
            if (methodRange && this.rangesEqual(methodRange, range)) {
              return method;
            }
          }
        }
      } else if (stmt.kind === "EnumDecl") {
        for (const method of (stmt as AST.EnumDecl).methods) {
          const methodRange = this.nodeToRange(method);
          if (methodRange && this.rangesEqual(methodRange, range)) {
            return method;
          }
        }
      } else if (stmt.kind === "SpecDecl") {
        for (const method of (stmt as AST.SpecDecl).methods) {
          const methodRange = this.nodeToRange(method);
          if (methodRange && this.rangesEqual(methodRange, range)) {
            return method;
          }
        }
      }
    }
    return null;
  }

  private findFunctionInWorkspace(
    name: string,
  ): { decl: CallableDecl; filePath: string } | null {
    const allFiles = this.astResolver.getAllCachedFiles();

    for (const filePath of allFiles) {
      const ast = this.astResolver.getCachedAST(filePath);
      if (!ast) continue;

      const funcDecl = this.findFunctionByName(ast, name);
      if (funcDecl) {
        return { decl: funcDecl, filePath };
      }
    }

    return null;
  }

  private findFunctionByName(
    ast: AST.Program,
    name: string,
  ): CallableDecl | null {
    for (const stmt of ast.statements) {
      if (stmt.kind === "FunctionDecl") {
        const func = stmt as AST.FunctionDecl;
        if (func.name === name) {
          return func;
        }
      } else if (stmt.kind === "StructDecl") {
        const struct = stmt as AST.StructDecl;
        for (const member of struct.members) {
          if (member.kind === "FunctionDecl") {
            const method = member as AST.FunctionDecl;
            if (method.name === name) {
              return method;
            }
          }
        }
      } else if (stmt.kind === "EnumDecl") {
        for (const method of (stmt as AST.EnumDecl).methods) {
          if (method.name === name) {
            return method;
          }
        }
      } else if (stmt.kind === "SpecDecl") {
        for (const method of (stmt as AST.SpecDecl).methods) {
          if (method.name === name) {
            return method;
          }
        }
      }
    }

    return null;
  }

  /**
   * Create call hierarchy item from callable declaration
   */
  private createCallHierarchyItem(
    funcDecl: CallableDecl,
    filePath: string,
  ): CallHierarchyItem {
    const range = this.nodeToRange(funcDecl);
    const selectionRange = range || Range.create(0, 0, 0, 0);

    return {
      name: funcDecl.name,
      kind:
        funcDecl.kind === "SpecMethod" ? SymbolKind.Method : SymbolKind.Function,
      uri: filePathToUri(filePath),
      range: selectionRange,
      selectionRange: selectionRange,
    };
  }

  /**
   * Create call hierarchy item from symbol
   */
  private createCallHierarchyItemFromSymbol(
    symbol: SymbolInfo,
    name: string,
  ): CallHierarchyItem {
    const filePath = symbol.filePath || "";
    const uri = filePathToUri(filePath);

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

  private callHierarchyItemKey(item: CallHierarchyItem): string {
    return [
      item.uri,
      item.selectionRange.start.line,
      item.selectionRange.start.character,
      item.selectionRange.end.line,
      item.selectionRange.end.character,
    ].join(":");
  }
}
