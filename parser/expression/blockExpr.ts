import type AsmGenerator from "../../transpiler/AsmGenerator";
import type Scope from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import Expression from "./expr";

export default class BlockExpr extends Expression {
  constructor(public expressions: Expression[]) {
    super(ExpressionType.BlockExpression);
  }

  toString(depth: number = 0): string {
    this.depth = depth;
    let output = this.getDepth() + "[ BlockExpr ]\n";
    for (const expr of this.expressions) {
      output += expr.toString(depth + 1);
    }
    output += this.getDepth() + "/[ BlockExpr ]\n";
    return output;
  }

  log(depth: number = 0): void {
    console.log(this.toString(depth));
  }

  transpile(gen: AsmGenerator, scope: Scope): void {
    gen.emit("; begin block", "block_begin");
    for (const expr of this.expressions) {
      expr.transpile(gen, scope);
    }
    gen.emit("; end block", "block_end");
  }
}
