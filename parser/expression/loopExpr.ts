import type { IRGenerator } from "../../transpiler/ir/IRGenerator";
import Scope from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import Expression from "./expr";

import type BlockExpr from "./blockExpr";
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

  toIR(gen: IRGenerator, scope: Scope): string {
    const bodyBlock = gen.createBlock("loop_body");
    const endBlock = gen.createBlock("loop_end");

    scope.setCurrentContext({
      type: "loop",
      breakLabel: endBlock.name,
      continueLabel: bodyBlock.name,
      stackOffset: scope.stackOffset,
    });

    gen.emitBranch(bodyBlock.name);
    gen.setBlock(bodyBlock);

    this.body.toIR(gen, scope);
    gen.emitBranch(bodyBlock.name);

    gen.setBlock(endBlock);
    scope.removeCurrentContext("loop");
    return "";
  }
}
