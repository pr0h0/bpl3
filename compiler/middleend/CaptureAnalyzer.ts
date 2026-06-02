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
          // Handle both BlockStmt and IfStmt (else if)
          this.visit((node as AST.IfStmt).elseBranch!);
        }
        break;
      case "Loop":
        if ((node as AST.LoopStmt).init) {
          this.visit((node as AST.LoopStmt).init!);
        }
        if ((node as AST.LoopStmt).condition)
          this.visit((node as AST.LoopStmt).condition!);
        if ((node as AST.LoopStmt).step) {
          this.visit((node as AST.LoopStmt).step!);
        }
        this.visit((node as AST.LoopStmt).body);
        break;
      case "Defer":
        this.visit((node as AST.DeferStmt).statement);
        break;
      case "Throw":
        this.visit((node as AST.ThrowStmt).expression);
        break;
      case "Try":
        this.visitTry(node as AST.TryStmt);
        break;
      case "Switch":
        this.visitSwitch(node as AST.SwitchStmt);
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
      case "Group":
        this.visit((node as AST.GroupExpr).expression);
        break;
      case "Ternary":
        this.visit((node as AST.TernaryExpr).condition);
        this.visit((node as AST.TernaryExpr).trueExpr);
        this.visit((node as AST.TernaryExpr).falseExpr);
        break;
      case "ArrayLiteral":
        (node as AST.ArrayLiteralExpr).elements.forEach((element) =>
          this.visit(element),
        );
        break;
      case "StructLiteral":
        (node as AST.StructLiteralExpr).fields.forEach((field) =>
          this.visit(field.value),
        );
        break;
      case "TupleLiteral":
        (node as AST.TupleLiteralExpr).elements.forEach((element) =>
          this.visit(element),
        );
        break;
      case "EnumStructVariant":
        (node as AST.EnumStructVariantExpr).fields.forEach((field) =>
          this.visit(field.value),
        );
        break;
      case "Sizeof":
        this.visit((node as AST.SizeofExpr).target as AST.ASTNode);
        break;
      case "TypeOf":
        this.visit((node as AST.TypeOfExpr).target as AST.ASTNode);
        break;
      case "TypeMatch":
        this.visit((node as AST.TypeMatchExpr).value as AST.ASTNode);
        break;
      case "Match":
        this.visitMatch(node as AST.MatchExpr);
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

  private visitSwitch(node: AST.SwitchStmt) {
    this.visit(node.expression);

    for (const switchCase of node.cases) {
      this.visit(switchCase.value);
      this.visit(switchCase.body);
    }

    if (node.defaultCase) {
      this.visit(node.defaultCase);
    }
  }

  private visitTry(node: AST.TryStmt) {
    this.visit(node.tryBlock);

    for (const clause of node.catchClauses) {
      const catchBindings =
        clause.variable && clause.type ? [clause] : [];
      this.withLocalDeclarations(catchBindings, () => {
        this.visit(clause.body);
      });
    }
  }

  private visitMatch(node: AST.MatchExpr) {
    this.visit(node.value);

    for (const arm of node.arms) {
      const patternBindings = this.collectPatternBindings(arm.pattern);
      this.withLocalDeclarations(patternBindings, () => {
        if (arm.guard) {
          this.visit(arm.guard);
        }
        this.visit(arm.body);
      });
    }
  }

  private collectPatternBindings(pattern: AST.Pattern): AST.ASTNode[] {
    switch (pattern.kind) {
      case "PatternIdentifier":
        return [pattern.bindingDeclaration ?? pattern];
      case "PatternEnumTuple":
        return pattern.bindings.flatMap((binding) =>
          this.collectPatternBindings(binding),
        );
      case "PatternEnumStruct":
        return pattern.fields.flatMap((field) =>
          field.bindingDeclaration ? [field.bindingDeclaration] : [],
        );
      case "PatternTuple":
        return pattern.patterns.flatMap((subPattern) =>
          this.collectPatternBindings(subPattern),
        );
      default:
        return [];
    }
  }

  private withLocalDeclarations(
    declarations: AST.ASTNode[],
    visitBody: () => void,
  ) {
    const added: AST.ASTNode[] = [];

    for (const declaration of declarations) {
      if (!this.localDeclarations.has(declaration)) {
        this.localDeclarations.add(declaration);
        added.push(declaration);
      }
    }

    try {
      visitBody();
    } finally {
      for (const declaration of added) {
        this.localDeclarations.delete(declaration);
      }
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
