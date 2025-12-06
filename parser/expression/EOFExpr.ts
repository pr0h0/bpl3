import type { IRGenerator } from "../../transpiler/ir/IRGenerator";
import type Scope from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import Expression from "./expr";

export default class EOFExpr extends Expression {
  constructor() {
    super(ExpressionType.EOF);
    this.requiresSemicolon = false;
  }

  toString(depth: number = 0): string {
    this.depth = depth;
    return this.getDepth() + "<EOF>\n";
  }

  toIR(gen: IRGenerator, scope: Scope): string {
    return "";
  }
}
