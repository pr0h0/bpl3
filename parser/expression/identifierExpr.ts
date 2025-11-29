import type AsmGenerator from "../../transpiler/AsmGenerator";
import type Scope from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import Expression from "./expr";

export default class IdentifierExpr extends Expression {
  constructor(public name: string) {
    super(ExpressionType.IdentifierExpr);
  }

  toString(depth: number = 0): string {
    this.depth = depth;
    let output = this.getDepth();
    output += "[ Identifier ]\n";
    this.depth++;
    output += this.getDepth() + `Name: ${this.name}\n`;
    this.depth--;
    output += this.getDepth() + "/[ Identifier ]\n";
    return output;
  }

  log(depth: number = 0): void {
    console.log(this.toString(depth));
  }

  transpile(gen: AsmGenerator, scope: Scope): void {
    const symbol = scope.resolve(this.name);
    if (!symbol) {
      throw new Error(`Undefined identifier: ${this.name}`);
    }
    const context = scope.getCurrentContext("LHS");

    let isStruct = false;
    if (!symbol.varType.isPointer && !symbol.varType.isArray.length) {
      const typeInfo = scope.resolveType(symbol.varType.name);
      if (typeInfo && !typeInfo.isPrimitive) {
        isStruct = true;
      }
    }

    const isArray = symbol.varType.isArray.length > 0;

    if (context || isStruct || isArray) {
      if ((isStruct || isArray) && symbol.isParameter) {
        gen.emit(
          `mov rax, [rbp - ${symbol.offset}]`,
          `Load address of parameter ${this.name}`,
        );
      } else {
        gen.emit(
          `lea rax, [${symbol.type === "global" ? "rel " + symbol.offset : "rbp - " + symbol.offset}]`,
        );
      }
    } else {
      let size = 8;
      let isSigned = false;
      if (symbol.varType.isPointer > 0 || symbol.varType.isArray.length > 0) {
        size = 8;
      } else {
        const typeInfo = scope.resolveType(symbol.varType.name);
        if (typeInfo) {
          size = typeInfo.size;
          isSigned = typeInfo.info.signed || false;
        }
      }

      const operand = `${symbol.type === "global" ? "rel " + symbol.offset : "rbp - " + symbol.offset}`;
      if (size === 1) {
        gen.emit(`movzx rax, byte [${operand}]`);
      } else if (size === 2) {
        gen.emit(`movzx rax, word [${operand}]`);
      } else if (size === 4) {
        if (symbol.varType.name === "f32") {
          gen.emit(`mov eax, dword [${operand}]`, "Load f32 bits");
        } else if (isSigned) {
          gen.emit(`movsxd rax, dword [${operand}]`);
        } else {
          gen.emit(`mov eax, dword [${operand}]`);
        }
      } else {
        gen.emit(`mov rax, [${operand}]`);
      }
    }
  }
}
