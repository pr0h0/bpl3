import Token from "../../lexer/token";
import type AsmGenerator from "../../transpiler/AsmGenerator";
import type Scope from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import Expression from "./expr";

export class AsmBlockExpr extends Expression {
  constructor(code: Token[]) {
    super(ExpressionType.AsmBlockExpression);
    this.code = code;
    this.requiresSemicolon = false;
  }

  public code: Token[];

  toString(depth: number = 0): string {
    this.depth = depth;
    let output = this.getDepth();
    output += `[ AsmBlockExpr ] {\n`;
    this.depth++;
    output += this.code
      .map((token) => this.getDepth() + token.value)
      .join("\n");
    this.depth--;
    output += `\n${this.getDepth()}} @${this.code[this.code.length - 1]?.line ?? "EOF"}\n`;
    return output;
  }

  log(depth: number = 0): void {
    console.log(this.toString(depth));
  }

  transpile(gen: AsmGenerator, scope: Scope): void {
    gen.emit("; missing asm block", "asm_block");
  }
}
