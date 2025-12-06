import type Token from "../../lexer/token";
import type Scope from "../../transpiler/Scope";
import type { IRGenerator } from "../../transpiler/ir/IRGenerator";
import ExpressionType from "../expressionType";
import Expression from "./expr";

export default class StringLiteralExpr extends Expression {
  constructor(
    public value: string,
    public token: Token,
  ) {
    super(ExpressionType.StringLiteralExpr);
  }

  toString(depth: number = 0): string {
    this.depth = depth;
    let output = this.getDepth();
    output += "[ StringLiteral ]\n";
    this.depth++;
    output += this.getDepth();
    output += `Value: "${this.value}"\n`;
    this.depth--;
    output += this.getDepth();
    output += "/[ StringLiteral ]\n";
    return output;
  }

  formatString(): string {
    return this.value
      .replaceAll('"', '", 0x22, "')
      .replaceAll("\\n", '", 0x0A, "')
      .replaceAll("\\t", '", 0x09, "');
  }

  toIR(gen: IRGenerator, scope: Scope): string {
    const unescaped = this.value
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\r/g, "\r")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
    return gen.getStringPtr(unescaped);
  }
}
