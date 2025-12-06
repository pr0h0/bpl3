import Scope from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import Expression from "./expr";
import NumberLiteralExpr from "./numberLiteralExpr";

import type BlockExpr from "./blockExpr";
import type { IRGenerator } from "../../transpiler/ir/IRGenerator";
import type { IRBlock } from "../../transpiler/ir/IRBlock";

export type SwitchCase = {
  value: NumberLiteralExpr;
  body: BlockExpr;
};

export default class SwitchExpr extends Expression {
  constructor(
    public discriminant: Expression,
    public cases: SwitchCase[],
    public defaultCase: BlockExpr | null,
  ) {
    super(ExpressionType.SwitchExpression);
    this.requiresSemicolon = false;
  }

  toString(depth: number = 0): string {
    this.depth = depth;
    let output = this.getDepth() + "[ SwitchExpr ]\n";
    this.depth++;
    output += this.getDepth() + " Discriminant:\n";
    output += this.discriminant.toString(depth + 1);

    for (const c of this.cases) {
      output += this.getDepth() + ` Case ${c.value.value}:\n`;
      output += c.body.toString(depth + 1);
    }

    if (this.defaultCase) {
      output += this.getDepth() + " Default:\n";
      output += this.defaultCase.toString(depth + 1);
    }

    this.depth--;
    output += this.getDepth() + "/[ SwitchExpr ]\n";
    return output;
  }

  toIR(gen: IRGenerator, scope: Scope): string {
    // ...existing code...
    const val = this.discriminant.toIR(gen, scope);

    const endBlock = gen.createBlock("switch_end");
    const defaultBlock = this.defaultCase
      ? gen.createBlock("switch_default")
      : endBlock;

    const cases: { val: number; block: IRBlock; body: BlockExpr }[] = [];
    for (const c of this.cases) {
      cases.push({
        val: Number(c.value.value),
        block: gen.createBlock(`switch_case_${c.value.value}`),
        body: c.body,
      });
    }

    gen.emitSwitch(
      val,
      defaultBlock.name,
      cases.map((c) => ({ val: c.val, label: c.block.name })),
    );

    for (const c of cases) {
      gen.setBlock(c.block);
      c.body.toIR(gen, scope);
      gen.emitBranch(endBlock.name);
    }

    if (this.defaultCase) {
      gen.setBlock(defaultBlock);
      this.defaultCase.toIR(gen, scope);
      gen.emitBranch(endBlock.name);
    }

    gen.setBlock(endBlock);
    return "";
  }
}
