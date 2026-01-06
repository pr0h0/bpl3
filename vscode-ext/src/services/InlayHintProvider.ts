import {
  type InlayHintParams,
  type InlayHint,
  InlayHintKind,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
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
  handle(_params: InlayHintParams, document: TextDocument): InlayHint[] {
    const filePath = document.uri.replace("file://", "");
    const content = document.getText();

    // Parse document
    this.astResolver.parseDocumentContent(filePath, content);
    const ast = this.astResolver.getCachedAST(filePath);
    if (!ast) return [];

    const hints: InlayHint[] = [];

    // Collect hints from the AST
    this.collectHints(ast, hints, document);

    return hints;
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

    // Position: after variable name
    const position = this.getPosition(
      node.location?.startLine || 1,
      (node.location?.startColumn || 0) + varName.length,
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

    // If not found, check for struct methods
    if (!params) {
      const structSymbols = this.symbolIndex.getAllSymbols();
      for (const sym of structSymbols) {
        if (sym.kind === "struct" && sym.methods) {
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
    for (let i = 0; i < node.args.length; i++) {
      const arg = node.args[i];
      let paramIndex = i;

      // Skip 'this' parameter for methods
      if (
        i === 0 &&
        params[0] &&
        params[0].name === "this" &&
        node.callee.kind === "Member"
      ) {
        continue;
      }

      // Adjust index if this was skipped
      if (params[0]?.name === "this" && node.callee.kind === "Member") {
        paramIndex = i + 1;
      }

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

    // Handle different node types
    // FunctionDecl.body is a BlockStmt, not an array
    if ("body" in node && node.body) {
      this.collectHints(node.body as AST.ASTNode, hints, document);
    }

    if ("statements" in node && Array.isArray(node.statements)) {
      for (const stmt of node.statements) {
        this.collectHints(stmt as AST.ASTNode, hints, document);
      }
    }

    if ("members" in node && Array.isArray(node.members)) {
      for (const member of node.members) {
        this.collectHints(member as AST.ASTNode, hints, document);
      }
    }

    if ("declarations" in node && Array.isArray(node.declarations)) {
      for (const decl of node.declarations) {
        this.collectHints(decl as AST.ASTNode, hints, document);
      }
    }

    if ("initializer" in node && node.initializer) {
      this.collectHints(node.initializer as AST.ASTNode, hints, document);
    }

    // Handle ExpressionStmt which wraps expressions like standalone function calls
    if ("expression" in node && node.expression) {
      this.collectHints(node.expression as AST.ASTNode, hints, document);
    }

    if ("args" in node && Array.isArray(node.args)) {
      for (const arg of node.args) {
        this.collectHints(arg as AST.ASTNode, hints, document);
      }
    }
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
}
