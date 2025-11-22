import type AsmGenerator from "../../transpiler/AsmGenerator";
import Scope from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import type BlockExpr from "./blockExpr";
import Expression from "./expr";

export default class IfExpr extends Expression {
  constructor(
    public condition: Expression,
    public thenBranch: BlockExpr,
    public elseBranch: BlockExpr | null,
  ) {
    super(ExpressionType.IfExpression);
    this.requiresSemicolon = false;
  }

  toString(depth: number = 0): string {
    this.depth = depth;
    let output = this.getDepth() + "[ IfExpr ]\n";
    this.depth++;
    output += this.getDepth() + " Condition:\n";
    output += this.condition.toString(depth + 1);
    output += this.getDepth() + " Then Branch:\n";
    output += this.thenBranch.toString(depth + 1);
    if (this.elseBranch) {
      output += this.getDepth() + " Else Branch:\n";
      output += this.elseBranch.toString(depth + 1);
    }

    this.depth--;
    output += this.getDepth() + "/[ IfExpr ]\n";
    return output;
  }

  log(depth: number = 0): void {
    console.log(this.toString(depth));
  }

  transpile(gen: AsmGenerator, scope: Scope): void {
    const ifLabel = gen.generateLabel("if_");
    const condLabel = ifLabel + "_cond";
    const thenLabel = ifLabel + "_then";
    const elseLabel = ifLabel + "_else";
    const endLabel = ifLabel + "_end";

    gen.emitLabel(condLabel);
    this.condition.transpile(gen, scope);
    gen.emit(`cmp rax, 0`);
    gen.emit(`je ${this.elseBranch ? elseLabel : endLabel}`);

    gen.emitLabel(thenLabel);
    this.thenBranch.transpile(gen, scope);
    gen.emit(`jmp ${endLabel}`);

    if (this.elseBranch) {
      gen.emitLabel(elseLabel);
      this.elseBranch.transpile(gen, scope);
    }

    gen.emitLabel(endLabel);
  }
}
