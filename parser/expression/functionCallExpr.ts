import type Scope from "../../transpiler/Scope";
import type { IRGenerator } from "../../transpiler/ir/IRGenerator";
import { IROpcode } from "../../transpiler/ir/IRInstruction";
import { IRVoid } from "../../transpiler/ir/IRType";
import { resolveExpressionType } from "../../utils/typeResolver";
import ExpressionType from "../expressionType";
import Expression from "./expr";

import type { VariableType } from "./variableDeclarationExpr";
export default class FunctionCallExpr extends Expression {
  constructor(
    public functionName: string,
    public args: Expression[],
    public genericArgs: VariableType[] = [],
  ) {
    super(ExpressionType.FunctionCall);
  }

  public isTailCall: boolean = false;
  public resolvedReturnType?: VariableType; // Set by semantic analyzer for generic function calls

  toString(depth: number = 0): string {
    this.depth = depth;
    let genericStr =
      this.genericArgs.length > 0
        ? `<${this.genericArgs.map((t) => this.printType(t)).join(", ")}>`
        : "";
    let output =
      this.getDepth() + `[ FunctionCall: ${this.functionName}${genericStr} ]\n`;
    this.depth++;
    for (const arg of this.args) {
      output += arg.toString(depth + 1);
    }
    this.depth--;
    output += this.getDepth() + `/[ FunctionCall ]\n`;
    return output;
  }

  toIR(gen: IRGenerator, scope: Scope): string {
    // Resolve function name (may be mangled if generic)
    let funcName = this.functionName;

    // If this is a generic call, look up the monomorphized version
    if (this.genericArgs.length > 0) {
      funcName = this.getMangledGenericName();
    }

    const func = scope.resolveFunction(funcName);
    if (!func) {
      throw new Error(`Function ${funcName} not found`);
    }

    // If this is an external function, ensure it's declared in the IR module
    if (func.isExternal && func.irName) {
      const IRFunction = require("../../transpiler/ir/IRFunction").IRFunction;
      const IRVoid = require("../../transpiler/ir/IRType").IRVoid;

      // Check if already declared
      if (!gen.module.functions.some((f: any) => f.name === func.irName)) {
        const retType = func.returnType
          ? gen.getIRType(func.returnType)
          : IRVoid;
        const args = (func.args || []).map((a: any) => ({
          name: a.name,
          type: gen.getIRType(a.type),
        }));
        const irFunc = new IRFunction(
          func.irName,
          args,
          retType,
          func.isVariadic || false,
        );
        gen.module.addFunction(irFunc);
      }
    }

    const argValues: { value: string; type: any }[] = [];

    this.args.forEach((arg, index) => {
      let val = arg.toIR(gen, scope);

      let type: any;
      if (func.args && func.args[index]) {
        type = gen.getIRType(func.args[index].type);

        // Check if cast is needed
        const argType = resolveExpressionType(arg, scope);
        if (argType) {
          const argIRType = gen.getIRType(argType);
          if (argIRType.type !== type.type) {
            // Handle casts
            if (argIRType.type.startsWith("i") && type.type.startsWith("i")) {
              const srcSize = parseInt(argIRType.type.substring(1));
              const destSize = parseInt(type.type.substring(1));
              if (srcSize < destSize) {
                const isSigned = ["i8", "i16", "i32"].includes(argType.name);
                const opcode = isSigned ? IROpcode.SEXT : IROpcode.ZEXT;
                val = gen.emitCast(opcode, val, type, argIRType);
              } else if (srcSize > destSize) {
                val = gen.emitCast(IROpcode.TRUNC, val, type, argIRType);
              }
            } else if (
              argIRType.type === "pointer" &&
              type.type.startsWith("i")
            ) {
              val = gen.emitCast(IROpcode.PTR_TO_INT, val, type, argIRType);
            } else if (
              argIRType.type.startsWith("i") &&
              type.type === "pointer"
            ) {
              val = gen.emitCast(IROpcode.INT_TO_PTR, val, type, argIRType);
            } else if (argIRType.type === "f32" && type.type === "f64") {
              val = gen.emitCast(IROpcode.FP_EXT, val, type, argIRType);
            } else if (argIRType.type === "f64" && type.type === "f32") {
              val = gen.emitCast(IROpcode.FP_TRUNC, val, type, argIRType);
            } else if (
              (argIRType.type === "f32" || argIRType.type === "f64") &&
              type.type.startsWith("i")
            ) {
              val = gen.emitCast(IROpcode.FP_TO_SI, val, type, argIRType);
            } else if (
              argIRType.type.startsWith("i") &&
              (type.type === "f32" || type.type === "f64")
            ) {
              val = gen.emitCast(IROpcode.SI_TO_FP, val, type, argIRType);
            }
          }
        }
      } else {
        const exprType = resolveExpressionType(arg, scope);
        type = exprType ? gen.getIRType(exprType) : { type: "i64" };

        // Array decay: arrays passed to varargs/unknown functions decay to pointers
        if (type.type === "array") {
          type = { type: "pointer", base: type.base };
        }

        // Promote f32 to f64 for varargs
        if (type.type === "f32") {
          val = gen.emitCast(IROpcode.FP_EXT, val, { type: "f64" }, type);
          type = { type: "f64" };
        }

        // Promote small ints to i64 for varargs (e.g. printf)
        if (
          type.type === "i1" ||
          type.type === "i8" ||
          type.type === "i16" ||
          type.type === "i32"
        ) {
          val = gen.emitCast(IROpcode.ZEXT, val, { type: "i64" }, type);
          type = { type: "i64" };
        }
      }

      argValues.push({ value: val, type: type });
    });

    const returnType = func.returnType
      ? gen.getIRType(func.returnType)
      : IRVoid;

    const irFuncName = func.irName || `@${funcName}`;

    const result = gen.emitCall(irFuncName, argValues, returnType);
    return result || "";
  }

  private getMangledGenericName(): string {
    const typeStrs = this.genericArgs.map((t) => this.mangleType(t));
    return `${this.functionName}__${typeStrs.join("_")}`;
  }

  private mangleType(type: VariableType): string {
    let name = type.name;
    if (type.isPointer > 0) {
      name = "ptr" + type.isPointer + "_" + name;
    }
    if (type.isArray.length > 0) {
      name = name + "_arr" + type.isArray.join("x");
    }
    return name;
  }
}
