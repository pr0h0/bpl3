import type AsmGenerator from "../../transpiler/AsmGenerator";
import type Scope from "../../transpiler/Scope";
import type LlvmGenerator from "../../transpiler/LlvmGenerator";
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
    this.contextScope = scope;

    // Handle 'args' identifier in variadic functions
    if (this.name === "args") {
      const variadicStart = scope.resolve("__variadic_start_offset__");
      if (variadicStart) {
        // 'args' used as an identifier (e.g. passed to function or assigned)
        // It represents the "array" of variadic args.
        // But since it's split between stack and registers, it's not a real array.
        // We can't easily return a pointer to it.
        // For now, throw error if used directly without index.
        throw new Error(
          "'args' can only be used with index access (args[i]) in variadic functions.",
        );
      }
    }

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

  generateIR(gen: LlvmGenerator, scope: Scope): string {
    const symbol = scope.resolve(this.name);
    if (!symbol) {
      throw new Error(`Undefined identifier: ${this.name}`);
    }

    if (!symbol.llvmName) {
      const func = scope.resolveFunction(this.name);
      if (func) {
        return `@${func.name}`;
      }
      throw new Error(`Variable ${this.name} has no LLVM representation`);
    }

    const context = scope.getCurrentContext("LHS");
    if (context) {
      return symbol.llvmName;
    }

    if (symbol.varType.isArray.length > 0) {
      // Array decay: return pointer to array
      return symbol.llvmName;
    }

    const type = gen.mapType(symbol.varType);
    const reg = gen.generateReg("load");
    gen.emit(`${reg} = load ${type}, ptr ${symbol.llvmName}`);
    return reg;
  }
}
