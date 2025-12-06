import { IROpcode } from "../../transpiler/ir/IROpcode";
import { IRI64 } from "../../transpiler/ir/IRType";
import { resolveExpressionType } from "../../utils/typeResolver";
import ExpressionType from "../expressionType";
import Expression from "./expr";

import type { IRGenerator } from "../../transpiler/ir/IRGenerator";
import type { IRType } from "../../transpiler/ir/IRType";
import type Scope from "../../transpiler/Scope";
export default class TernaryExpr extends Expression {
  constructor(
    public condition: Expression,
    public trueExpr: Expression,
    public falseExpr: Expression,
  ) {
    super(ExpressionType.TernaryExpression);
  }

  toString(depth: number = 0): string {
    this.depth = depth;
    let output = this.getDepth();
    output += "[ Ternary Expression ]\n";
    output += this.condition.toString(this.depth + 1);
    output +=
      this.trueExpr?.toString(this.depth + 1) ??
      this.getDepth() + this.getDepth() + "null\n";
    output += this.falseExpr.toString(this.depth + 1);
    output += this.getDepth();
    output += "/[ Ternary Expression ]\n";
    return output;
  }

  toIR(gen: IRGenerator, scope: Scope): string {
    let condition = this.condition.toIR(gen, scope);
    const condType = resolveExpressionType(this.condition, scope);

    if (condType) {
      const irType = gen.getIRType(condType);
      if (irType.type !== "i1") {
        condition = gen.emitBinary(IROpcode.NE, irType, condition, "0");
      }
    } else {
      condition = gen.emitBinary(IROpcode.NE, { type: "i64" }, condition, "0");
    }

    const trueBlock = gen.createBlock("ternary_true");
    const falseBlock = gen.createBlock("ternary_false");
    const endBlock = gen.createBlock("ternary_end");

    const type =
      resolveExpressionType(this.trueExpr, scope) ||
      resolveExpressionType(this.falseExpr, scope);
    const irType: IRType = type ? gen.getIRType(type) : IRI64;

    const resultPtr = gen.emitAlloca(irType);

    gen.emitCondBranch(condition, trueBlock.name, falseBlock.name);

    gen.setBlock(trueBlock);
    const trueVal = this.trueExpr.toIR(gen, scope);
    gen.emitStore(irType, trueVal, resultPtr);
    gen.emitBranch(endBlock.name);

    gen.setBlock(falseBlock);
    const falseVal = this.falseExpr.toIR(gen, scope);
    gen.emitStore(irType, falseVal, resultPtr);
    gen.emitBranch(endBlock.name);

    gen.setBlock(endBlock);
    return gen.emitLoad(irType, resultPtr);
  }
}
