import type AsmGenerator from "../../transpiler/AsmGenerator";
import type Scope from "../../transpiler/Scope";
import type LlvmGenerator from "../../transpiler/LlvmGenerator";
import ExpressionType from "../expressionType";
import Expression from "./expr";

export default class NullLiteral extends Expression {
  constructor() {
    super(ExpressionType.NullLiteralExpr);
  }

  toString(depth: number = 0): string {
    this.depth = depth;
    return this.getDepth() + `[ NullLiteral ] NULL /[ NullLiteral ]\n`;
  }

  log(depth: number = 0): void {
    console.log(this.toString(depth));
  }

  transpile(gen: AsmGenerator | LlvmGenerator, scope: Scope): void {
    gen.emit("mov rax, 0", "NULL LITERAL");
  }

  generateIR(gen: LlvmGenerator, scope: Scope): string {
    return "null";
  }
}
