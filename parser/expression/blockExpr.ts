import type { IRGenerator } from "../../transpiler/ir/IRGenerator";
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

  optimize(): Expression {
    this.expressions = this.expressions.map((expr) => expr.optimize());
    return this;
  }

  toIR(gen: IRGenerator, scope: Scope): string {
    for (const expr of this.expressions) {
      expr.toIR(gen, scope);
    }
    return "";
  }
}
