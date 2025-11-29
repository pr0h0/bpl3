import Token from "../../lexer/token";
import TokenType from "../../lexer/tokenType";
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
        line += this.interpolateVariables(gen, scope, nextToken);
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
      return `[rel ${variable.offset}]`;
    }
    return `[rbp - ${variable.offset}]`;
  }
}
