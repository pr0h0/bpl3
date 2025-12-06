import type Token from "../../lexer/token";
import ExpressionType from "../expressionType";
import Expression from "./expr";

import type Scope from "../../transpiler/Scope";
import type { IRGenerator } from "../../transpiler/ir/IRGenerator";

export default class NumberLiteralExpr extends Expression {
  constructor(
    public value: string,
    public token: Token,
  ) {
    super(ExpressionType.NumberLiteralExpr);
  }

  toString(depth: number = 0): string {
    this.depth = depth;
    let output = this.getDepth();
    output += "[ NumberLiteral ]\n";
    this.depth++;
    output += this.getDepth();
    output += `Value: ${this.value}\n`;
    this.depth--;
    output += this.getDepth();
    output += "/[ NumberLiteral ]\n";
    return output;
  }

  toIR(gen: IRGenerator, scope: Scope): string {
    const isHexBinOct =
      this.value.startsWith("0x") ||
      this.value.startsWith("0b") ||
      this.value.startsWith("0o");

    if (
      !isHexBinOct &&
      (this.value.includes(".") || this.value.toLowerCase().includes("e"))
    ) {
      if (!this.value.includes(".")) {
        return this.value.replace(/e/i, ".0e");
      }
      return this.value;
    }
    // Convert hex/bin/oct to decimal
    try {
      return BigInt(this.value).toString();
    } catch (e) {
      return this.value;
    }
  }
}
