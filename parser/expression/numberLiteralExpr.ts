import type Token from "../../lexer/token";
import Expression from "./expr";
import ExpressionType from "../expressionType";
import type AsmGenerator from "../../transpiler/AsmGenerator";
import type Scope from "../../transpiler/Scope";

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

  log(depth: number = 0): void {
    console.log(this.toString(depth));
  }

  transpile(gen: AsmGenerator, scope: Scope): void {
    gen.emit(`mov rax, ${this.value}`, `Load literal ${this.value}`);
  }
}
