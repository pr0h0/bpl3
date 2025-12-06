import Token from "../../lexer/token";
import TokenType from "../../lexer/tokenType";
import ExpressionType from "../expressionType";
import Expression from "./expr";

import type { IRGenerator } from "../../transpiler/ir/IRGenerator";
import type Scope from "../../transpiler/Scope";
export default class AsmBlockExpr extends Expression {
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

  toIR(gen: IRGenerator, scope: Scope): string {
    let asmString = "";
    const args: string[] = [];
    let argIndex = 0;
    let lastLine = -1;

    for (let i = 0; i < this.code.length; i++) {
      const token = this.code[i]!;

      if (lastLine !== -1 && token.line !== lastLine) {
        asmString += "\n\t";
      }
      lastLine = token.line;

      if (token.value === ";") {
        while (
          i + 1 < this.code.length &&
          this.code[i + 1]!.line === token.line
        ) {
          i++;
        }
        continue;
      }

      if (token.value === "(") {
        const varToken = this.code[++i]!;
        if (this.code[i + 1]?.value !== ")") {
          throw new Error("Expected )");
        }
        i++; // skip )

        const variable = scope.resolve(varToken.value);
        if (!variable) throw new Error(`Undefined var ${varToken.value}`);

        if (variable.irName) {
          args.push(variable.irName);
          asmString += `$${argIndex++}`;
        } else {
          throw new Error(`Variable ${varToken.value} has no irName`);
        }
      } else {
        if (token.type === TokenType.STRING_LITERAL) {
          asmString += `"${token.value}"`;
        } else {
          asmString += token.value;
        }
        if (token.type !== TokenType.DOT) {
          asmString += " ";
        }
      }
    }

    const constraints = args.map(() => "r").join(",");
    const clobbers =
      "~{dirflag},~{fpsr},~{flags},~{memory},~{rax},~{rbx},~{rcx},~{rdx},~{rsi},~{rdi},~{r8},~{r9}";
    const constraintsStr = constraints
      ? `${constraints},${clobbers}`
      : clobbers;

    gen.emitInlineAsm(asmString, constraintsStr, args);
    return "";
  }
}
