import type AsmGenerator from "../../transpiler/AsmGenerator";
import Scope from "../../transpiler/Scope";
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
    const loopLabel = gen.generateLabel("loop_");
    const loopStartLabel = loopLabel + "_start";
    const loopEndLabel = loopLabel + "_end";

    gen.emitLabel(loopStartLabel);

    scope.setCurrentContext({
      type: "loop",
      breakLabel: loopEndLabel,
      continueLabel: loopStartLabel,
    });

    this.body.transpile(gen, scope);

    scope.removeCurrentContext("loop");

    gen.emit(`jmp ${loopStartLabel}`, "jump to the beginning of the loop");
    gen.emitLabel(loopEndLabel);
  }
}
