import type { IRGenerator } from "../../transpiler/ir/IRGenerator";
import { type IRType, IRI64 } from "../../transpiler/ir/IRType";
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

  optimize(): Expression {
    if (this.value) {
      this.value = this.value.optimize();
      if (this.value instanceof FunctionCallExpr) {
        this.value.isTailCall = true;
      }
    }
    return this;
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

  toIR(gen: IRGenerator, scope: Scope): string {
    const context = scope.getCurrentContext("function");
    if (!context || context.type !== "function") {
      throw new Error("Return statement not within a function context");
    }

    if (this.value) {
      const val = this.value.toIR(gen, scope);
      let type: IRType = IRI64;
      if (context.returnType) {
        type = gen.getIRType(context.returnType);
      }

      if (type.type === "pointer" && val === "0") {
        gen.emitReturn("null", type);
      } else {
        gen.emitReturn(val, type);
      }
    } else {
      gen.emitReturn(null);
    }
    return "";
  }
}
