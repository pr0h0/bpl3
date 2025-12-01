import type Token from "../../lexer/token";
import Expression from "./expr";
import ExpressionType from "../expressionType";
import type AsmGenerator from "../../transpiler/AsmGenerator";
import type Scope from "../../transpiler/Scope";
import type LlvmGenerator from "../../transpiler/LlvmGenerator";

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
    if (this.value.includes(".")) {
      const label = gen.generateLabel("float_");
      gen.emitRoData(label, "dq", this.value);
      gen.emit(
        `movsd xmm0, [rel ${label}]`,
        `Load float literal ${this.value}`,
      );
      gen.emit(`movq rax, xmm0`, `Move float to RAX for transport`);
    } else {
      gen.emit(`mov rax, ${this.value}`, `Number Literal ${this.value}`);
    }
  }

  generateIR(gen: LlvmGenerator, scope: Scope): string {
    // For LLVM, we can return the literal value directly.
    // If it's a float, we might need to ensure it has a decimal point or is in scientific notation if required?
    // LLVM accepts standard float formats.
    if (this.value.includes(".")) {
      return this.value;
    }
    // Convert hex/bin/oct to decimal for LLVM IR
    try {
      return BigInt(this.value).toString();
    } catch (e) {
      return this.value;
    }
  }
}
