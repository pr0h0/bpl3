import type AsmGenerator from "../../transpiler/AsmGenerator";
import type LlvmGenerator from "../../transpiler/LlvmGenerator";
import type Scope from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import Expression from "./expr";
import StringLiteralExpr from "./stringLiteralExpr";
import NumberLiteralExpr from "./numberLiteralExpr";
import IdentifierExpr from "./identifierExpr";
import type { VariableType } from "./variableDeclarationExpr";

export default class TernaryExpr extends Expression {
  constructor(
    public condition: Expression,
    public trueExpr: Expression,
    public falseExpr: Expression,
  ) {
    super(ExpressionType.TernaryExpression);
  }

  toString(depth: number = 0): string {
    this.depth = depth;
    let output = this.getDepth();
    output += "[ Ternary Expression ]\n";
    output += this.condition.toString(this.depth + 1);
    output +=
      this.trueExpr?.toString(this.depth + 1) ??
      this.getDepth() + this.getDepth() + "null\n";
    output += this.falseExpr.toString(this.depth + 1);
    output += this.getDepth();
    output += "/[ Ternary Expression ]\n";
    return output;
  }

  log(depth: number = 0): void {
    console.log(this.toString(depth));
  }

  transpile(gen: AsmGenerator, scope: Scope): void {
    const label = gen.generateLabel("ternary_");
    const conditionLabel = `${label}_condition`;
    const trueLabel = `${label}_true`;
    const falseLabel = `${label}_false`;
    const endLabel = `${label}_end`;

    gen.emitLabel(conditionLabel);
    this.condition.transpile(gen, scope);
    gen.emit(`cmp rax, 0`, "compare condition result to 0");
    gen.emit(`je ${falseLabel}`, "jump to false branch if condition is false");

    gen.emitLabel(trueLabel);
    this.trueExpr.transpile(gen, scope);
    gen.emit(`jmp ${endLabel}`, "jump to end after true branch");

    gen.emitLabel(falseLabel);
    this.falseExpr.transpile(gen, scope);
    gen.emitLabel(endLabel);
  }

  private resolveExpressionType(
    expr: Expression,
    scope: Scope,
  ): VariableType | null {
    if (expr instanceof StringLiteralExpr) {
      return { name: "u8", isPointer: 1, isArray: [] };
    }
    if (expr instanceof NumberLiteralExpr) {
      return expr.value.includes(".")
        ? { name: "f64", isPointer: 0, isArray: [] }
        : { name: "u64", isPointer: 0, isArray: [] };
    }
    if (expr instanceof IdentifierExpr) {
      const resolved = scope.resolve(expr.name);
      return resolved ? resolved.varType : null;
    }
    return null;
  }

  generateIR(gen: LlvmGenerator, scope: Scope): string {
    const condition = this.condition.generateIR(gen, scope);

    const trueLabel = gen.generateLabel("ternary_true");
    const falseLabel = gen.generateLabel("ternary_false");
    const endLabel = gen.generateLabel("ternary_end");

    const type =
      this.resolveExpressionType(this.trueExpr, scope) ||
      this.resolveExpressionType(this.falseExpr, scope);
    const llvmType = type ? gen.mapType(type) : "i64";
    const resultVar = gen.generateLocal("ternary_result");
    gen.emit(`  %${resultVar} = alloca ${llvmType}`);

    const condBool = gen.generateReg("cond");
    gen.emit(`${condBool} = icmp ne i64 ${condition}, 0`);
    gen.emit(`br i1 ${condBool}, label %${trueLabel}, label %${falseLabel}`);

    // True Branch
    gen.emitLabel(trueLabel);
    const trueVal = this.trueExpr.generateIR(gen, scope);
    gen.emit(`store ${llvmType} ${trueVal}, ptr %${resultVar}`);
    gen.emit(`br label %${endLabel}`);

    // False Branch
    gen.emitLabel(falseLabel);
    const falseVal = this.falseExpr.generateIR(gen, scope);
    gen.emit(`store ${llvmType} ${falseVal}, ptr %${resultVar}`);
    gen.emit(`br label %${endLabel}`);

    // End
    gen.emitLabel(endLabel);
    const resultReg = gen.generateReg("ternary_res");
    gen.emit(`${resultReg} = load ${llvmType}, ptr %${resultVar}`);

    return resultReg;
  }
}
