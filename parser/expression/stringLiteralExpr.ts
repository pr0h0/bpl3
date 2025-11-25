import type Token from "../../lexer/token";
import type AsmGenerator from "../../transpiler/AsmGenerator";
import type Scope from "../../transpiler/Scope";
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

  log(depth: number = 0): void {
    console.log(this.toString(depth));
  }

  formatString(): string {
    return this.value
      .replaceAll('"', '", 0x22, "')
      .replaceAll("\\n", '", 0x0A, "')
      .replaceAll("\\t", '", 0x09, "');
  }

  transpile(gen: AsmGenerator, scope: Scope): void {
    const label = gen.generateLabel("str_");
    gen.emitRoData(label, "db", `"${this.formatString()}", 0`);
    gen.emit(
      `lea rax, [rel ${label}]`,
      `Load address of string literal "${this.value}"`,
    );
  }
}
