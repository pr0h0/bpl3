import type AsmGenerator from "../../transpiler/AsmGenerator";
import type LlvmGenerator from "../../transpiler/LlvmGenerator";
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

  log(depth: number = 0): void {
    console.log(this.toString(depth));
  }

  transpile(gen: AsmGenerator, scope: Scope): void {
    const context = scope.getCurrentContext("loop");
    if (!context) {
      throw new Error("Break statement used outside of a loop");
    }
    if (context.type === "loop") {
      gen.emit(`jmp ${context.breakLabel}`, "BREAK EXPR");
    }
  }

  generateIR(gen: LlvmGenerator, scope: Scope): string {
    const context = scope.getCurrentContext("loop");
    if (!context) {
      throw new Error("Break statement used outside of a loop");
    }
    if (context.type === "loop") {
      gen.emit(`br label %${context.breakLabel}`);
    }
    return "";
  }
}
