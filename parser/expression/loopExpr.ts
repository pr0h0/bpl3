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
    if (this.startToken) gen.emitSourceLocation(this.startToken.line);
    const label = gen.generateLabel("loop_");
    const startLabel = `${label}_start`;
    const endLabel = `${label}_end`;

    scope.setCurrentContext({
      type: "loop",
      continueLabel: startLabel,
      breakLabel: endLabel,
      stackOffset: scope.stackOffset,
    });

    gen.emitLabel(startLabel);
    this.body.transpile(gen, scope);
    gen.emit(`jmp ${startLabel}`, "jump to start of loop");
    gen.emitLabel(endLabel);

    scope.removeCurrentContext("loop");
  }
}
