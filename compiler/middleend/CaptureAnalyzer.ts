import * as AST from "../common/AST";

export class CaptureAnalyzer {
  private capturedVariables: Set<AST.ASTNode> = new Set();
  private localDeclarations: Set<AST.ASTNode> = new Set();
  private lambdaExpr: AST.LambdaExpr;

  constructor(lambdaExpr: AST.LambdaExpr) {
    this.lambdaExpr = lambdaExpr;
    // Add params to local declarations
    lambdaExpr.params.forEach((p) => this.localDeclarations.add(p));
  }

  public analyze(): (AST.VariableDecl | AST.Parameter | AST.LambdaParameter)[] {
    this.visit(this.lambdaExpr.body);
    // Return as VariableDecl[] (casting needed as we store ASTNode)
    return Array.from(this.capturedVariables) as (
      | AST.VariableDecl
      | AST.Parameter
      | AST.LambdaParameter
    )[];
  }

  private visit(node: AST.ASTNode) {
    if (!node) return;

    switch (node.kind) {
      case "Identifier":
        this.visitIdentifier(node as AST.IdentifierExpr);
        break;
      case "Block":
        (node as AST.BlockStmt).statements.forEach((s) => this.visit(s));
        break;
      case "VariableDecl":
        // Visit initializer first (e.g. local x = x; refers to outer x)
        if ((node as AST.VariableDecl).initializer) {
          this.visit((node as AST.VariableDecl).initializer!);
        }
        // Then add to locals
        this.localDeclarations.add(node);
        break;
      case "Return":
        if ((node as AST.ReturnStmt).value) {
          this.visit((node as AST.ReturnStmt).value!);
        }
        break;
      case "Binary":
        this.visit((node as AST.BinaryExpr).left);
        this.visit((node as AST.BinaryExpr).right);
        break;
      case "Unary":
        this.visit((node as AST.UnaryExpr).operand);
        break;
      case "Call":
        this.visit((node as AST.CallExpr).callee);
        (node as AST.CallExpr).args.forEach((a) => this.visit(a));
        break;
      case "If":
        this.visit((node as AST.IfStmt).condition);
        this.visit((node as AST.IfStmt).thenBranch);
        if ((node as AST.IfStmt).elseBranch) {
          if ((node as AST.IfStmt).elseBranch!.kind === "If") {
            this.visit((node as AST.IfStmt).elseBranch!);
          } else {
            this.visit((node as AST.IfStmt).elseBranch!);
          }
        }
        break;
      case "Loop":
        if ((node as AST.LoopStmt).condition)
          this.visit((node as AST.LoopStmt).condition!);
        this.visit((node as AST.LoopStmt).body);
        break;
      case "ExpressionStmt":
        this.visit((node as AST.ExpressionStmt).expression);
        break;
      case "Assignment":
        this.visit((node as AST.AssignmentExpr).assignee);
        this.visit((node as AST.AssignmentExpr).value);
        break;
      case "Member":
        this.visit((node as AST.MemberExpr).object);
        break;
      case "Index":
        this.visit((node as AST.IndexExpr).object);
        this.visit((node as AST.IndexExpr).index);
        break;
      case "Cast":
        this.visit((node as AST.CastExpr).expression);
        break;
      case "Ternary":
        this.visit((node as AST.TernaryExpr).condition);
        this.visit((node as AST.TernaryExpr).trueExpr);
        this.visit((node as AST.TernaryExpr).falseExpr);
        break;
      case "LambdaExpression":
        const lambda = node as AST.LambdaExpr;
        if (lambda.capturedVariables) {
          lambda.capturedVariables.forEach((decl) => this.checkCapture(decl));
        }
        break;
      // Add other nodes as needed
    }
  }

  private checkCapture(decl: AST.ASTNode) {
    // Check if it's a local declaration
    if (this.localDeclarations.has(decl)) {
      return;
    }

    // If it's a global variable, we don't capture it
    if (decl.kind === "VariableDecl" && (decl as AST.VariableDecl).isGlobal) {
      return;
    }

    // If it's a function, struct, etc., we don't capture
    if (
      decl.kind === "FunctionDecl" ||
      decl.kind === "StructDecl" ||
      decl.kind === "EnumDecl" ||
      decl.kind === "Extern"
    ) {
      return;
    }

    // It's a capture!
    this.capturedVariables.add(decl);
  }

  private visitIdentifier(node: AST.IdentifierExpr) {
    if (node.resolvedDeclaration) {
      this.checkCapture(node.resolvedDeclaration);
    }
  }
}
