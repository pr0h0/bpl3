import {
  type InlayHintParams,
  type InlayHint,
  InlayHintKind,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { fileURLToPath } from "url";
import * as AST from "../../../compiler/common/AST";
import { ASTResolver } from "./ASTResolver";
import { SymbolIndex } from "./SymbolIndex";

/**
 * Provides inlay hints - shows inferred types and parameter names inline.
 */
export class InlayHintProvider {
  constructor(
    private astResolver: ASTResolver,
    private symbolIndex: SymbolIndex,
  ) {}

  /**
   * Handle inlay hint request
   */
  handle(params: InlayHintParams, document: TextDocument): InlayHint[] {
    const filePath = fileURLToPath(document.uri);
    const content = document.getText();

    // Parse document
    this.astResolver.parseDocumentContent(filePath, content);
    const ast = this.astResolver.getCachedAST(filePath);
    if (!ast) return [];

    const hints: InlayHint[] = [];

    // Collect hints from the AST
    this.collectHints(ast, hints, document);

    return hints.filter((hint) =>
      this.positionInRange(hint.position, params.range),
    );
  }

  /**
   * Collect inlay hints from AST
   */
  private collectHints(
    node: AST.ASTNode,
    hints: InlayHint[],
    document: TextDocument,
  ): void {
    if (!node) return;

    // Variable declarations without explicit type
    if (node.kind === "VariableDecl") {
      this.handleVariableDecl(node as AST.VariableDecl, hints, document);
    }

    // Function calls - show parameter names
    if (node.kind === "Call") {
      this.handleFunctionCall(node as AST.CallExpr, hints, document);
    }

    // Traverse children
    this.traverseNode(node, hints, document);
  }

  /**
   * Handle variable declaration hints
   */
  private handleVariableDecl(
    node: AST.VariableDecl,
    hints: InlayHint[],
    document: TextDocument,
  ): void {
    // Skip if type is already explicitly specified
    if (node.typeAnnotation) return;

    // Skip destructuring for now (complex to display)
    if (typeof node.name !== "string") return;

    const varName = node.name;

    if (!varName || !node.initializer) return;

    // Try to infer the type from initializer
    const type = this.inferType(node.initializer);
    if (!type || type === "unknown") return;

    const position = this.getVariableNameEndPosition(
      node,
      varName,
      document,
    );

    hints.push({
      position,
      label: `: ${type}`,
      kind: InlayHintKind.Type,
      paddingLeft: false,
      paddingRight: false,
    });
  }

  /**
   * Handle function call parameter hints
   */
  private handleFunctionCall(
    node: AST.CallExpr,
    hints: InlayHint[],
    document: TextDocument,
  ): void {
    if (!node.args || node.args.length === 0) return;

    // Get function name
    const funcName = this.getFunctionName(node.callee);
    if (!funcName) return;

    // Look up function signature (regular functions)
    let params: any[] | undefined;
    const symbols = this.symbolIndex.findSymbol(funcName);

    if (symbols && symbols.length > 0) {
      const symbol = symbols.find((s) => s.kind === "function");
      if (symbol?.signature?.parameters) {
        params = symbol.signature.parameters;
      }
    }

    // If not found, check for methods stored on struct/enum symbols.
    if (!params) {
      const symbolsWithMethods = this.symbolIndex.getAllSymbols();
      for (const sym of symbolsWithMethods) {
        if (sym.methods) {
          for (const method of sym.methods) {
            if (method.name === funcName) {
              // Methods store parameters in method.signature.parameters
              params = method.signature?.parameters;
              break;
            }
          }
        }
        if (params) break;
      }
    }

    if (!params) return;

    // Add parameter name hints
    const hasImplicitThisParam =
      params[0]?.name === "this" && node.callee.kind === "Member";
    for (let i = 0; i < node.args.length; i++) {
      const arg = node.args[i];
      const paramIndex = hasImplicitThisParam ? i + 1 : i;

      const param = params[paramIndex];
      if (!param) continue;

      // Skip if argument is a simple identifier matching the parameter name
      if (
        arg &&
        arg.kind === "Identifier" &&
        (arg as AST.IdentifierExpr).name === param.name
      ) {
        continue;
      }

      // Position: before the argument
      if (!arg || !arg.location) continue;

      const position = this.getPosition(
        arg.location.startLine,
        arg.location.startColumn,
        document,
      );

      hints.push({
        position,
        label: `${param.name}:`,
        kind: InlayHintKind.Parameter,
        paddingLeft: false,
        paddingRight: true,
      });
    }
  }

  /**
   * Get function name from call expression
   */
  private getFunctionName(func: AST.Expression): string | null {
    if (func.kind === "Identifier") {
      return (func as AST.IdentifierExpr).name;
    }
    if (func.kind === "Member") {
      return (func as AST.MemberExpr).property;
    }
    return null;
  }

  /**
   * Infer type from expression (basic implementation)
   */
  private inferType(expr: AST.Expression): string | null {
    if (!expr) return null;

    switch (expr.kind) {
      case "Literal": {
        const lit = expr as AST.LiteralExpr;
        switch (lit.type) {
          case "number":
            // Check if it's a float or int
            if (typeof lit.value === "number" && Number.isInteger(lit.value)) {
              return "int";
            } else if (typeof lit.raw === "string" && !lit.raw.includes(".")) {
              return "int";
            }
            return "float";
          case "string":
            return "string";
          case "bool":
            return "bool";
          case "char":
            return "char";
          case "null":
          case "nullptr":
            return "nullptr";
          default:
            return null;
        }
      }
      case "ArrayLiteral": {
        const arr = expr as AST.ArrayLiteralExpr;
        if (arr.elements && arr.elements.length > 0 && arr.elements[0]) {
          const elemType = this.inferType(arr.elements[0]);
          return elemType ? `${elemType}[]` : "unknown[]";
        }
        return "unknown[]";
      }
      case "StructLiteral":
        return (expr as AST.StructLiteralExpr).structName;
      case "Call": {
        const call = expr as AST.CallExpr;
        const funcName = this.getFunctionName(call.callee);
        if (funcName) {
          const symbols = this.symbolIndex.findSymbol(funcName);
          if (symbols && symbols.length > 0) {
            const sym = symbols[0];
            if (
              sym &&
              sym.kind === "function" &&
              sym.signature &&
              sym.signature.returnType
            ) {
              return sym.signature.returnType;
            }
          }
        }
        return null;
      }
      case "Identifier": {
        const ident = expr as AST.IdentifierExpr;
        // Look up in symbol index
        const symbols = this.symbolIndex.findSymbol(ident.name);
        if (symbols && symbols.length > 0) {
          const sym = symbols[0];
          if (sym && sym.kind === "variable" && "type" in sym) {
            return (sym as any).type || null;
          }
        }
        return null;
      }
      default:
        return null;
    }
  }

  /**
   * Traverse AST node and collect hints from children
   */
  private traverseNode(
    node: AST.ASTNode,
    hints: InlayHint[],
    document: TextDocument,
  ): void {
    if (!node) return;

    for (const child of this.getChildNodes(node)) {
      this.collectHints(child, hints, document);
    }
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
   * Convert AST location to LSP position
   */
  private getPosition(
    line: number,
    column: number,
    _document: TextDocument,
  ): { line: number; character: number } {
    // AST uses 1-based, LSP uses 0-based
    return {
      line: Math.max(0, line - 1),
      character: Math.max(0, column - 1),
    };
  }

  private getVariableNameEndPosition(
    node: AST.VariableDecl,
    varName: string,
    document: TextDocument,
  ): { line: number; character: number } {
    const line = Math.max(0, (node.location?.startLine || 1) - 1);
    const searchStart = Math.max(0, (node.location?.startColumn || 1) - 1);
    const lineText = document.getText({
      start: { line, character: 0 },
      end: { line: line + 1, character: 0 },
    });
    const nameIndex = lineText.indexOf(varName, searchStart);

    if (nameIndex >= 0) {
      return { line, character: nameIndex + varName.length };
    }

    return this.getPosition(
      node.location?.startLine || 1,
      (node.location?.startColumn || 0) + varName.length,
      document,
    );
  }

  private positionInRange(
    position: { line: number; character: number },
    range: InlayHintParams["range"],
  ): boolean {
    if (position.line < range.start.line || position.line > range.end.line) {
      return false;
    }
    if (
      position.line === range.start.line &&
      position.character < range.start.character
    ) {
      return false;
    }
    if (
      position.line === range.end.line &&
      position.character > range.end.character
    ) {
      return false;
    }
    return true;
  }
}
