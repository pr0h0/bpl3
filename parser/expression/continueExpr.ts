import type { IRGenerator } from "../../transpiler/ir/IRGenerator";
import type Scope from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import Expression from "./expr";

export default class ContinueExpr extends Expression {
  constructor() {
    super(ExpressionType.ContinueExpression);
  }

  toString(depth: number = 0): string {
    this.depth = depth;
    let output = this.getDepth();
    output += "[ Continue Expression ] /[ Continue Expression ]\n";
    return output;
  }

  toIR(gen: IRGenerator, scope: Scope): string {
    const context = scope.getCurrentContext("loop");
    if (!context || context.type !== "loop") {
      throw new Error("Continue statement used outside of a loop");
    }
    gen.emitBranch(context.continueLabel);
    return "";
  }
}
