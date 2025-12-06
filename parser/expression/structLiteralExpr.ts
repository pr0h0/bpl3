import ExpressionType from "../expressionType";
import Expression from "./expr";

import type { IRGenerator } from "../../transpiler/ir/IRGenerator";
import type Scope from "../../transpiler/Scope";

export interface StructLiteralField {
  fieldName?: string;
  value: Expression;
}

export default class StructLiteralExpr extends Expression {
  constructor(public fields: StructLiteralField[]) {
    super(ExpressionType.StructLiteralExpr);
  }

  toString(depth: number = 0): string {
    this.depth = depth;
    let output = this.getDepth();
    output += "[ StructLiteralExpr ]\n";
    this.depth++;
    for (const field of this.fields) {
      output += this.getDepth();
      if (field.fieldName) {
        output += `${field.fieldName}: `;
      }
      output += "\n";
      output += field.value.toString(this.depth + 1);
    }
    this.depth--;
    output += this.getDepth();
    output += "/[ StructLiteralExpr ]\n";
    return output;
  }

  toIR(gen: IRGenerator, scope: Scope): string {
    throw new Error(
      "StructLiteralExpr.toIR should not be called directly. It should be handled by VariableDeclarationExpr.",
    );
  }
}
