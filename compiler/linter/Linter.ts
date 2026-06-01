import * as AST from "../common/AST";
import { CompilerError, DiagnosticSeverity } from "../common/CompilerError";

export interface LintRule {
  code: string;
  name: string;
  check(node: AST.ASTNode, context: LintContext): void;
}

export interface LintContext {
  report(
    message: string,
    node: AST.ASTNode,
    severity?: DiagnosticSeverity,
    code?: string,
  ): void;
}

export class Linter {
  private rules: LintRule[] = [];
  private errors: CompilerError[] = [];

  constructor(extraRules: LintRule[] = []) {
    this.registerRules();
    this.rules.push(...extraRules);
  }

  private registerRules() {
    this.rules.push(new NamingConventionRule());
  }

  public lint(program: AST.Program): CompilerError[] {
    this.errors = [];
    const context: LintContext = {
      report: (
        message,
        node,
        _severity = DiagnosticSeverity.Warning,
        code = "LINT",
      ) => {
        const error = new CompilerError(
          message,
          "Lint check failed",
          node.location,
          code,
        );
        error.setSeverity(_severity);
        this.errors.push(error);
      },
    };

    this.visit(program, context);
    return this.errors;
  }

  private visit(node: AST.ASTNode, context: LintContext) {
    if (!node) return;

    // Run rules
    for (const rule of this.rules) {
      rule.check(node, context);
    }

    // Traverse children
    switch (node.kind) {
      case "Program":
        for (const stmt of (node as AST.Program).statements) {
          this.visit(stmt, context);
        }
        break;
      case "FunctionDecl":
        const func = node as AST.FunctionDecl;
        for (const param of func.params) {
          this.visit(param, context);
        }
        if (func.body) this.visit(func.body, context);
        break;
      case "StructDecl":
        const struct = node as AST.StructDecl;
        for (const member of struct.members) {
          this.visit(member, context);
        }
        break;
      case "Block":
        for (const stmt of (node as AST.BlockStmt).statements) {
          this.visit(stmt, context);
        }
        break;
      case "If":
        const ifStmt = node as AST.IfStmt;
        this.visit(ifStmt.condition, context);
        this.visit(ifStmt.thenBranch, context);
        if (ifStmt.elseBranch) this.visit(ifStmt.elseBranch, context);
        break;
      case "Loop":
        const loopStmt = node as AST.LoopStmt;
        if (loopStmt.condition) this.visit(loopStmt.condition, context);
        this.visit(loopStmt.body, context);
        break;
      case "Return":
        const retStmt = node as AST.ReturnStmt;
        if (retStmt.value) this.visit(retStmt.value, context);
        break;
      case "VariableDecl":
        const varDecl = node as AST.VariableDecl;
        if (varDecl.initializer) this.visit(varDecl.initializer, context);
        break;
      case "Binary":
        const binExpr = node as AST.BinaryExpr;
        this.visit(binExpr.left, context);
        this.visit(binExpr.right, context);
        break;
      case "Call":
        const callExpr = node as AST.CallExpr;
        this.visit(callExpr.callee, context);
        for (const arg of callExpr.args) {
          this.visit(arg, context);
        }
        break;
      case "Group":
        this.visit((node as AST.GroupExpr).expression, context);
        break;
      // Add more cases as needed
    }
  }
}

class NamingConventionRule implements LintRule {
  code = "L001";
  name = "naming-convention";

  check(node: AST.ASTNode, context: LintContext) {
    if (node.kind === "StructDecl") {
      const decl = node as AST.StructDecl;
      if (!/^[A-Z][a-zA-Z0-9]*$/.test(decl.name)) {
        context.report(
          `Struct '${decl.name}' should be PascalCase`,
          node,
          DiagnosticSeverity.Warning,
          this.code,
        );
      }
    } else if (node.kind === "FunctionDecl") {
      const decl = node as AST.FunctionDecl;
      // Skip main
      if (decl.name === "main") return;

      if (!/^[a-z][a-zA-Z0-9]*$/.test(decl.name)) {
        context.report(
          `Function '${decl.name}' should be camelCase.`,
          node,
          DiagnosticSeverity.Warning,
          this.code,
        );
      }
    }
  }
}
