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
        this.visit(func.returnType, context);
        if (func.body) this.visit(func.body, context);
        break;
      case "StructDecl":
        const struct = node as AST.StructDecl;
        for (const member of struct.members) {
          this.visit(member, context);
        }
        break;
      case "StructField":
        this.visit((node as AST.StructField).type, context);
        break;
      case "SpecDecl":
        const spec = node as AST.SpecDecl;
        for (const extendedType of spec.extends) {
          this.visit(extendedType, context);
        }
        for (const method of spec.methods) {
          this.visit(method, context);
        }
        break;
      case "SpecMethod":
        const specMethod = node as AST.SpecMethod;
        for (const param of specMethod.params) {
          this.visit(param, context);
        }
        if (specMethod.returnType) this.visit(specMethod.returnType, context);
        break;
      case "EnumDecl":
        const enumDecl = node as AST.EnumDecl;
        for (const variant of enumDecl.variants) {
          this.visit(variant, context);
        }
        for (const method of enumDecl.methods) {
          this.visit(method, context);
        }
        break;
      case "EnumVariant":
        const variant = node as AST.EnumVariant;
        if (variant.dataType) this.visit(variant.dataType, context);
        break;
      case "EnumVariantTuple":
        for (const variantType of (node as AST.EnumVariantTuple).types) {
          this.visit(variantType, context);
        }
        break;
      case "EnumVariantStruct":
        for (const field of (node as AST.EnumVariantStruct).fields) {
          this.visit(field.type, context);
        }
        break;
      case "TypeAlias":
        this.visit((node as AST.TypeAliasDecl).type, context);
        break;
      case "BasicType":
        for (const genericArg of (node as AST.BasicTypeNode).genericArgs) {
          this.visit(genericArg, context);
        }
        break;
      case "TupleType":
        for (const tupleType of (node as AST.TupleTypeNode).types) {
          this.visit(tupleType, context);
        }
        break;
      case "FunctionType":
        const functionType = node as AST.FunctionTypeNode;
        this.visit(functionType.returnType, context);
        for (const paramType of functionType.paramTypes) {
          this.visit(paramType, context);
        }
        break;
      case "LambdaType":
        const lambdaType = node as AST.LambdaTypeNode;
        this.visit(lambdaType.returnType, context);
        for (const paramType of lambdaType.paramTypes) {
          this.visit(paramType, context);
        }
        break;
      case "MetaType":
        this.visit((node as AST.MetaType).type, context);
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
        if (loopStmt.init) this.visit(loopStmt.init, context);
        if (loopStmt.condition) this.visit(loopStmt.condition, context);
        this.visit(loopStmt.body, context);
        if (loopStmt.step) this.visit(loopStmt.step, context);
        break;
      case "Return":
        const retStmt = node as AST.ReturnStmt;
        if (retStmt.value) this.visit(retStmt.value, context);
        break;
      case "Throw":
        this.visit((node as AST.ThrowStmt).expression, context);
        break;
      case "Try":
        const tryStmt = node as AST.TryStmt;
        this.visit(tryStmt.tryBlock, context);
        for (const catchClause of tryStmt.catchClauses) {
          this.visit(catchClause, context);
        }
        break;
      case "CatchClause":
        const catchClause = node as AST.CatchClause;
        if (catchClause.type) this.visit(catchClause.type, context);
        this.visit(catchClause.body, context);
        break;
      case "Switch":
        const switchStmt = node as AST.SwitchStmt;
        this.visit(switchStmt.expression, context);
        for (const switchCase of switchStmt.cases) {
          this.visit(switchCase, context);
        }
        if (switchStmt.defaultCase) this.visit(switchStmt.defaultCase, context);
        break;
      case "Case":
        const switchCase = node as AST.SwitchCase;
        this.visit(switchCase.value, context);
        this.visit(switchCase.body, context);
        break;
      case "Defer":
        this.visit((node as AST.DeferStmt).statement, context);
        break;
      case "ExpressionStmt":
        this.visit((node as AST.ExpressionStmt).expression, context);
        break;
      case "Parameter":
        this.visit((node as AST.Parameter).type, context);
        break;
      case "VariableDecl":
        const varDecl = node as AST.VariableDecl;
        if (varDecl.typeAnnotation) this.visit(varDecl.typeAnnotation, context);
        if (varDecl.initializer) this.visit(varDecl.initializer, context);
        break;
      case "InterpolatedString":
        const interpolated = node as AST.InterpolatedStringExpr;
        for (const part of interpolated.parts) {
          this.visit(part, context);
        }
        if (interpolated.desugared) this.visit(interpolated.desugared, context);
        break;
      case "Binary":
        const binExpr = node as AST.BinaryExpr;
        this.visit(binExpr.left, context);
        this.visit(binExpr.right, context);
        break;
      case "Unary":
        this.visit((node as AST.UnaryExpr).operand, context);
        break;
      case "Call":
        const callExpr = node as AST.CallExpr;
        this.visit(callExpr.callee, context);
        for (const arg of callExpr.args) {
          this.visit(arg, context);
        }
        break;
      case "Member":
        this.visit((node as AST.MemberExpr).object, context);
        break;
      case "Index":
        const indexExpr = node as AST.IndexExpr;
        this.visit(indexExpr.object, context);
        this.visit(indexExpr.index, context);
        break;
      case "ArrayLiteral":
        for (const element of (node as AST.ArrayLiteralExpr).elements) {
          this.visit(element, context);
        }
        break;
      case "StructLiteral":
        for (const field of (node as AST.StructLiteralExpr).fields) {
          this.visit(field.value, context);
        }
        break;
      case "TupleLiteral":
        for (const element of (node as AST.TupleLiteralExpr).elements) {
          this.visit(element, context);
        }
        break;
      case "EnumStructVariant":
        for (const field of (node as AST.EnumStructVariantExpr).fields) {
          this.visit(field.value, context);
        }
        break;
      case "Cast":
        this.visit((node as AST.CastExpr).expression, context);
        break;
      case "Sizeof":
        this.visit((node as AST.SizeofExpr).target, context);
        break;
      case "TypeOf":
        this.visit((node as AST.TypeOfExpr).target, context);
        break;
      case "TypeMatch":
        const typeMatch = node as AST.TypeMatchExpr;
        this.visit(typeMatch.targetType, context);
        this.visit(typeMatch.value, context);
        break;
      case "Match":
        const matchExpr = node as AST.MatchExpr;
        this.visit(matchExpr.value, context);
        for (const arm of matchExpr.arms) {
          this.visit(arm, context);
        }
        break;
      case "MatchArm":
        const matchArm = node as AST.MatchArm;
        this.visit(matchArm.pattern, context);
        if (matchArm.guard) this.visit(matchArm.guard, context);
        this.visit(matchArm.body, context);
        break;
      case "PatternLiteral":
        this.visit((node as AST.PatternLiteral).value, context);
        break;
      case "PatternTuple":
        for (const pattern of (node as AST.PatternTuple).patterns) {
          this.visit(pattern, context);
        }
        break;
      case "PatternEnumTuple":
        for (const binding of (node as AST.PatternEnumTuple).bindings) {
          this.visit(binding, context);
        }
        break;
      case "PatternEnumStruct":
        for (const field of (node as AST.PatternEnumStruct).fields) {
          if (field.bindingDeclaration) {
            this.visit(field.bindingDeclaration, context);
          }
        }
        break;
      case "Assignment":
        const assignment = node as AST.AssignmentExpr;
        this.visit(assignment.assignee, context);
        this.visit(assignment.value, context);
        break;
      case "Ternary":
        const ternary = node as AST.TernaryExpr;
        this.visit(ternary.condition, context);
        this.visit(ternary.trueExpr, context);
        this.visit(ternary.falseExpr, context);
        break;
      case "GenericInstantiation":
        const genericInstantiation = node as AST.GenericInstantiationExpr;
        this.visit(genericInstantiation.base, context);
        for (const genericArg of genericInstantiation.genericArgs) {
          this.visit(genericArg, context);
        }
        break;
      case "LambdaExpression":
        const lambda = node as AST.LambdaExpr;
        for (const param of lambda.params) {
          this.visit(param, context);
        }
        if (lambda.returnType) this.visit(lambda.returnType, context);
        this.visit(lambda.body, context);
        break;
      case "Is":
        const isExpr = node as AST.IsExpr;
        this.visit(isExpr.expression, context);
        this.visit(isExpr.type, context);
        break;
      case "As":
        const asExpr = node as AST.AsExpr;
        this.visit(asExpr.expression, context);
        this.visit(asExpr.type, context);
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
