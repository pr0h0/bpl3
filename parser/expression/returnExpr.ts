import type AsmGenerator from "../../transpiler/AsmGenerator";
import type LlvmGenerator from "../../transpiler/LlvmGenerator";
import type Scope from "../../transpiler/Scope";
import ExpressionType from "../expressionType";
import Expression from "./expr";
import FunctionCallExpr from "./functionCallExpr";

export default class ReturnExpr extends Expression {
  constructor(public value: Expression | null) {
    super(ExpressionType.ReturnExpression);
  }

  toString(depth: number = 0): string {
    this.depth = depth;
    let output = this.getDepth();
    output += "[ Return Expression ]\n";
    this.depth++;
    if (this.value) {
      output += this.getDepth();
      output += `Value:\n`;
      output += this.value.toString(this.depth + 1);
    } else {
      output += this.getDepth();
      output += `Value: null\n`;
    }
    this.depth--;
    output += this.getDepth();
    output += "/[ Return Expression ]\n";
    return output;
  }

  log(depth: number = 0): void {
    console.log(this.toString(depth));
  }

  optimize(): Expression {
    if (this.value) {
      this.value = this.value.optimize();
      if (this.value instanceof FunctionCallExpr) {
        this.value.isTailCall = true;
      }
    }
    return this;
  }

  transpile(gen: AsmGenerator, scope: Scope): void {
    if (this.startToken) gen.emitSourceLocation(this.startToken.line);
    const context = scope.getCurrentContext("function");
    if (!context) {
      throw new Error("Return statement not within a function context");
    }

    if (this.value) {
      this.value.transpile(gen, scope);

      const funcContext = scope.getCurrentContext("function");
      if (funcContext && funcContext.type === "function") {
        const returnSlot = scope.resolve("__return_slot__");
        if (returnSlot && funcContext.returnType) {
          let typeInfo;
          if (
            funcContext.returnType.genericArgs &&
            funcContext.returnType.genericArgs.length > 0
          ) {
            typeInfo = scope.resolveGenericType(
              funcContext.returnType.name,
              funcContext.returnType.genericArgs,
            );
          } else {
            typeInfo = scope.resolveType(funcContext.returnType.name);
          }

          if (typeInfo) {
            gen.emit("push rax", "Save source address");
            gen.emit(
              `mov rdi, [rbp - ${returnSlot.offset}]`,
              "Destination address",
            );
            gen.emit("pop rsi", "Source address");
            gen.emit(`mov rcx, ${typeInfo.size}`, "Size to copy");
            gen.emit("rep movsb", "Copy struct to return slot");
            gen.emit(
              `mov rax, [rbp - ${returnSlot.offset}]`,
              "Return address of result",
            );
          }
        }
      }
    } else {
      gen.emit("xor rax, rax", "set return value to 0 (void)");
    }

    if (context.type === "function") {
      gen.emit(`jmp ${context.endLabel}`, "jump to function return");
    }
  }

  private getIntSize(typeName: string): number {
    switch (typeName) {
      case "i8":
      case "u8":
      case "char":
      case "bool":
        return 1;
      case "i16":
      case "u16":
        return 2;
      case "i32":
      case "u32":
        return 4;
      case "i64":
      case "u64":
      case "int":
      case "usize":
        return 8;
      default:
        return 8;
    }
  }

  generateIR(gen: LlvmGenerator, scope: Scope): string {
    const context = scope.getCurrentContext("function");
    if (!context || context.type !== "function") {
      throw new Error("Return statement not within a function context");
    }

    if (this.value) {
      const val = this.value.generateIR(gen, scope);
      if (context.returnType) {
        const type = gen.mapType(context.returnType);

        const returnSize = this.getIntSize(context.returnType.name);
        if (
          returnSize < 8 &&
          !context.returnType.isPointer &&
          !context.returnType.isArray.length
        ) {
          let valIsI64 = false;
          if (
            this.value.type === ExpressionType.BinaryExpression ||
            this.value.type === ExpressionType.NumberLiteralExpr
          ) {
            valIsI64 = true;
          }

          if (valIsI64) {
            const trunc = gen.generateReg("trunc");
            gen.emit(`  ${trunc} = trunc i64 ${val} to ${type}`);
            gen.emit(`  ret ${type} ${trunc}`);
            return "";
          }
        }

        if (type === "ptr" && val === "0") {
          gen.emit(`  ret ptr null`);
        } else {
          gen.emit(`  ret ${type} ${val}`);
        }
      } else {
        // If return type is void but we have a value, it's weird but maybe allowed?
        // Usually semantic analyzer catches this.
        gen.emit(`  ret void`);
      }
    } else {
      gen.emit("  ret void");
    }
    return "";
  }
}
