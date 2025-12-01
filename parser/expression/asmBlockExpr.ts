import Token from "../../lexer/token";
import TokenType from "../../lexer/tokenType";
import type AsmGenerator from "../../transpiler/AsmGenerator";
import type LlvmGenerator from "../../transpiler/LlvmGenerator";
import type Scope from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import Expression from "./expr";

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

  log(depth: number = 0): void {
    console.log(this.toString(depth));
  }

  transpile(gen: AsmGenerator | LlvmGenerator, scope: Scope): void {
    let lastLine = -1;
    let line = "";
    for (let i = 0; i < this.code.length; i++) {
      const token = this.code[i]!;
      if (token.line !== lastLine) {
        if (line.length > 0) {
          gen.emit(line.trim(), "inline assembly");
        }
        line = "";
        lastLine = token.line;
      }
      if (token.value === ";") {
        // skip until new line
        while (
          i + 1 < this.code.length &&
          this.code[i + 1]!.line === token.line
        ) {
          i++;
        }
        continue;
      }
      if (token.value === "(") {
        let nextToken = this.code[++i]!;
        if (this.code[i + 1]?.value !== ")") {
          // TODO: Allow more complex expressions inside inline assembly once stucts and arrays are supported
          console.error(
            "Currently only single variable interpolation is supported in inline assembly.",
          );
          throw new Error(
            `Expected ')' after '(' in inline assembly @${token.line}`,
          );
        }
        line += this.interpolateVariables(
          gen as AsmGenerator,
          scope,
          nextToken,
        );
        i++; // Skip closing ')'
        line += " ";
      } else {
        if (token.type === TokenType.STRING_LITERAL) {
          line += `"${token.value}"`;
        } else {
          line += token.value;
        }

        if (token.type !== TokenType.DOT) {
          line += " ";
        }
      }
    }
    if (line.length > 0) {
      gen.emit(line.trim(), "inline assembly");
    }
  }

  interpolateVariables(gen: AsmGenerator, scope: Scope, token: Token): string {
    const varName = token.value;
    const variable = scope.resolve(varName!);
    if (!variable) {
      throw new Error(
        `Undefined variable '${varName}' in inline assembly @${token.line}`,
      );
    }
    if (variable.type === "global") {
      return `rel ${variable.offset}`;
    }
    return `rbp - ${variable.offset}`;
  }

  generateIR(gen: LlvmGenerator, scope: Scope): string {
    let asmString = "";
    const args: { value: string; type: string }[] = [];
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

        let valReg = "";
        let type = "i64";

        if (variable.llvmName) {
          // Pass pointer directly for memory operand
          valReg = variable.llvmName;
          type = "ptr";
        } else {
          throw new Error(`Variable ${varToken.value} has no llvmName`);
        }

        args.push({ value: valReg, type: type });
        asmString += `$${argIndex++}`;
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

    // Use r constraint to pass address in register
    const constraints = args.map(() => "r").join(",");
    const argsStr = args.map((a) => `${a.type} ${a.value}`).join(", ");

    const escapedAsm = asmString
      .replace(/\\/g, "\\\\")
      .replace(/"/g, "\\22")
      .replace(/\n/g, "\\0A\t");

    // Use inteldialect for Intel syntax
    // Clobber list: We clobber common scratch registers and some others.
    // We leave r10-r15 available for inputs/outputs to avoid "more registers than available" error.
    const clobbers =
      "~{dirflag},~{fpsr},~{flags},~{memory},~{rax},~{rbx},~{rcx},~{rdx},~{rsi},~{rdi},~{r8},~{r9}";

    const constraintsStr = constraints
      ? `${constraints},${clobbers}`
      : clobbers;

    gen.emit(
      `call void asm sideeffect inteldialect "${escapedAsm}", "${constraintsStr}"(${argsStr})`,
    );

    return "";
  }
}
