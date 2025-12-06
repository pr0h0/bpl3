import type Scope from "../../transpiler/Scope";
import type { IRGenerator } from "../../transpiler/ir/IRGenerator";
import ExpressionType from "../expressionType";
import Expression from "./expr";

export default class NullLiteral extends Expression {
  constructor() {
    super(ExpressionType.NullLiteralExpr);
  }

  toString(depth: number = 0): string {
    this.depth = depth;
    return this.getDepth() + `[ NullLiteral ] NULL /[ NullLiteral ]\n`;
  }

  toIR(gen: IRGenerator, scope: Scope): string {
    return "null";
  }
}
