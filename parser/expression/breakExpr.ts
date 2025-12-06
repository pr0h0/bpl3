import type { IRGenerator } from "../../transpiler/ir/IRGenerator";
import type Scope from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import Expression from "./expr";

export default class BreakExpr extends Expression {
  constructor() {
    super(ExpressionType.BreakExpression);
  }

  toString(depth: number = 0): string {
    this.depth = depth;
    let output = this.getDepth();
    output += "[ Break Expression ] /[ Break Expression ]\n";
    return output;
  }

  toIR(gen: IRGenerator, scope: Scope): string {
    const context = scope.getCurrentContext("loop");
    if (!context || context.type !== "loop") {
      throw new Error("Break statement used outside of a loop");
    }
    gen.emitBranch(context.breakLabel);
    return "";
  }
}
