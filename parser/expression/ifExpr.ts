import type { IRGenerator } from "../../transpiler/ir/IRGenerator";
import { IROpcode } from "../../transpiler/ir/IRInstruction";
import { IRI64 } from "../../transpiler/ir/IRType";
import Scope from "../../transpiler/Scope";
import { resolveExpressionType } from "../../utils/typeResolver";
import ExpressionType from "../expressionType";
import Expression from "./expr";

import type BlockExpr from "./blockExpr";
export default class IfExpr extends Expression {
  constructor(
    public condition: Expression,
    public thenBranch: BlockExpr,
    public elseBranch: BlockExpr | null,
  ) {
    super(ExpressionType.IfExpression);
    this.requiresSemicolon = false;
  }

  toString(depth: number = 0): string {
    this.depth = depth;
    let output = this.getDepth() + "[ IfExpr ]\n";
    this.depth++;
    output += this.getDepth() + " Condition:\n";
    output += this.condition.toString(depth + 1);
    output += this.getDepth() + " Then Branch:\n";
    output += this.thenBranch.toString(depth + 1);
    if (this.elseBranch) {
      output += this.getDepth() + " Else Branch:\n";
      output += this.elseBranch.toString(depth + 1);
    }

    this.depth--;
    output += this.getDepth() + "/[ IfExpr ]\n";
    return output;
  }

  toIR(gen: IRGenerator, scope: Scope): string {
    const condition = this.condition.toIR(gen, scope);
    const condType = resolveExpressionType(this.condition, scope);
    const irType = condType ? gen.getIRType(condType) : IRI64;

    // Compare condition to 0 to get boolean
    const cmp = gen.emitBinary(IROpcode.NE, irType, condition, "0");

    const thenBlock = gen.createBlock("then");
    const elseBlock = this.elseBranch ? gen.createBlock("else") : null;
    const mergeBlock = gen.createBlock("merge");

    gen.emitCondBranch(
      cmp,
      thenBlock.name,
      elseBlock ? elseBlock.name : mergeBlock.name,
    );

    gen.setBlock(thenBlock);
    this.thenBranch.toIR(gen, scope);
    gen.emitBranch(mergeBlock.name);

    if (elseBlock) {
      gen.setBlock(elseBlock);
      this.elseBranch!.toIR(gen, scope);
      gen.emitBranch(mergeBlock.name);
    }

    gen.setBlock(mergeBlock);
    return "";
  }
}
