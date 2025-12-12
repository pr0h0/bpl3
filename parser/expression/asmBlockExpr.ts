import Token from "../../lexer/token";
import TokenType from "../../lexer/tokenType";
import { CompilerError } from "../../errors";
import ExpressionType from "../expressionType";
import Expression from "./expr";
import { getAsmClobbers, getTarget, isInlineAsmSupported } from "../../utils/target";

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
    const args: { value: string; type: any }[] = [];
    const argConstraints: string[] = [];
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

      // Handle [(var)] -> Load value
      if (token.value === "[" && this.code[i + 1]?.value === "(") {
        i++; // skip [
        const varToken = this.code[++i]!; // skip ( and get var
        if (this.code[i + 1]?.value !== ")") {
          throw new CompilerError("Expected )", token.line);
        }
        i++; // skip )
        if (this.code[i + 1]?.value !== "]") {
          throw new CompilerError("Expected ]", token.line);
        }
        i++; // skip ]

        const variable = scope.resolve(varToken.value);
        if (!variable)
          throw new CompilerError(
            `Undefined var ${varToken.value}`,
            varToken.line,
          );

        if (variable.irName) {
          // We use "m" constraint (memory operand) for [(var)].
          // This passes the address (pointer) to the ASM block.
          // LLVM replaces $N with the memory reference (e.g. [rbp-8]).
          // This allows both reading (mov reg, [mem]) and writing (mov [mem], reg).
          // Passing "r" (value) would prevent writing back to the variable.
          const irType = gen.getIRType(variable.varType);
          // We pass the pointer to the variable
          args.push({
            value: variable.irName,
            type: { type: "pointer", base: irType },
          });
          argConstraints.push("*m");
          asmString += `$${argIndex++}`;
        } else {
          throw new CompilerError(
            `Variable ${varToken.value} has no irName`,
            varToken.line,
          );
        }
      }
      // Handle (var) -> Pass address (pointer)
      else if (token.value === "(") {
        const varToken = this.code[++i]!;
        if (this.code[i + 1]?.value !== ")") {
          throw new CompilerError("Expected )", token.line);
        }
        i++; // skip )

        const variable = scope.resolve(varToken.value);
        if (!variable)
          throw new CompilerError(
            `Undefined var ${varToken.value}`,
            varToken.line,
          );

        if (variable.irName) {
          args.push({
            value: variable.irName,
            type: { type: "pointer", base: gen.getIRType(variable.varType) },
          });
          argConstraints.push("r");
          asmString += `$${argIndex++}`;
        } else {
          throw new CompilerError(
            `Variable ${varToken.value} has no irName`,
            varToken.line,
          );
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

    // Check if inline assembly is supported for this target
    const target = getTarget();
    if (!isInlineAsmSupported()) {
      throw new CompilerError(
        `Inline assembly is not supported for target ${target.arch}. ` +
          `Consider using libc functions or extern declarations instead.`,
        this.code[0]?.line ?? 0,
      );
    }

    const constraints = argConstraints.join(",");
    const clobbers = getAsmClobbers();
    const constraintsStr = constraints
      ? `${constraints},${clobbers}`
      : clobbers;

    // Prepend nop to avoid LLVM/Clang dropping the first instruction
    // when using inteldialect with AT&T output.
    gen.emitInlineAsm("nop\n\t" + asmString, constraintsStr, args);
    return "";
  }
}
