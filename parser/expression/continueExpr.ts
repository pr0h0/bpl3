import type AsmGenerator from "../../transpiler/AsmGenerator";
import type LlvmGenerator from "../../transpiler/LlvmGenerator";
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

  log(depth: number = 0): void {
    console.log(this.toString(depth));
  }

  transpile(gen: AsmGenerator, scope: Scope): void {
    const context = scope.getCurrentContext("loop");
    if (!context) {
      throw new Error("Continue statement used outside of a loop");
    }
    if (context.type === "loop") {
      gen.emit(`jmp ${context.continueLabel}`, "CONTINUE EXPR");
    }
  }

  generateIR(gen: LlvmGenerator, scope: Scope): string {
    const context = scope.getCurrentContext("loop");
    if (!context) {
      throw new Error("Continue statement used outside of a loop");
    }
    if (context.type === "loop") {
      gen.emit(`br label %${context.continueLabel}`);
    }
    return "";
  }
}
