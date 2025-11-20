import type AsmGenerator from "../../transpiler/AsmGenerator";
import type Scope from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import type BlockExpr from "./blockExpr";
import Expression from "./expr";

export default class LoopExpr extends Expression {
  constructor(public body: BlockExpr) {
    super(ExpressionType.LoopExpression);
    this.requiresSemicolon = false;
  }

  toString(depth: number = 0): string {
    this.depth = depth;
    let output = this.getDepth();
    output += "[ LoopExpression ]\n";
    output += this.body.toString(this.depth + 1);
    output += this.getDepth();
    output += "/[ LoopExpression ]\n";
    return output;
  }

  log(depth: number = 0): void {
    console.log(this.toString(depth));
  }

  transpile(gen: AsmGenerator, scope: Scope): void {
    gen.emit("; Loop expression not yet implemented", "Loop expression");
    this.body.transpile(gen, scope);
    gen.emit("; End of loop expression", "Loop expression");
  }
}
