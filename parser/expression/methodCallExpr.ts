import type { IRGenerator } from "../../transpiler/ir/IRGenerator";
import { IRVoid } from "../../transpiler/ir/IRType";
import { mangleMethod } from "../../utils/methodMangler";
import { resolveExpressionType } from "../../utils/typeResolver";
import ExpressionType from "../expressionType";
import Expression from "./expr";

import type Scope from "../../transpiler/Scope";
import type { VariableType } from "./variableDeclarationExpr";

export default class MethodCallExpr extends Expression {
  public resolvedReturnType?: VariableType;

  constructor(
    public receiver: Expression,
    public methodName: string,
    public args: Expression[],
    public genericArgs: VariableType[] = [],
  ) {
    super(ExpressionType.MethodCallExpr);
  }

  toString(depth: number = 0): string {
    this.depth = depth;
    let output = this.getDepth() + `[ MethodCall: ${this.methodName} ]\n`;
    this.depth++;
    output += this.getDepth() + "Receiver:\n";
    output += this.receiver.toString(this.depth + 1);
    output += this.getDepth() + "Arguments:\n";
    this.depth++;
    for (const arg of this.args) {
      output += arg.toString(this.depth + 1);
    }
    this.depth--;
    this.depth--;
    output += this.getDepth() + `/[ MethodCall ]\n`;
    return output;
  }

  toIR(gen: IRGenerator, scope: Scope): string {
    // Resolve receiver type
    const receiverType = resolveExpressionType(this.receiver, scope);
    if (!receiverType) {
      throw new Error(
        `Cannot resolve receiver type for method call '${this.methodName}'`,
      );
    }

    // Handle pointer receivers - get base type
    let baseType: VariableType = receiverType;
    if (receiverType.isPointer > 0) {
      baseType = {
        ...receiverType,
        isPointer: receiverType.isPointer - 1,
      };
    }

    // Get canonical type name for mangling (handles generics)
    let structName = baseType.name;
    if (baseType.genericArgs && baseType.genericArgs.length > 0) {
      const typeInfo = scope.resolveGenericType(
        baseType.name,
        baseType.genericArgs,
      );
      if (typeInfo) {
        structName = typeInfo.name;
      }
    }

    // Mangle method name
    let mangledName = mangleMethod(structName, this.methodName);

    // Check if this was monomorphized (semantic analyzer sets this)
    if (this.monomorphizedName) {
      mangledName = this.monomorphizedName;
    }

    // Resolve function
    let func = scope.resolveFunction(mangledName);

    // Inheritance lookup
    if (!func) {
      let currentStructName = structName;
      let depth = 0;
      while (depth < 10) {
        const typeInfo = scope.resolveType(currentStructName);
        if (!typeInfo || !typeInfo.parentType) break;

        currentStructName = typeInfo.parentType;
        const parentMangledName = mangleMethod(
          currentStructName,
          this.methodName,
        );
        const parentFunc = scope.resolveFunction(parentMangledName);
        if (parentFunc) {
          func = parentFunc;
          mangledName = parentMangledName;
          break;
        }
        depth++;
      }
    }

    if (!func) {
      throw new Error(
        `Method '${this.methodName}' not found on type '${structName}'`,
      );
    }

    // Get receiver address
    let receiverPtr: string;
    if (receiverType.isPointer > 0) {
      // Already a pointer, use directly
      receiverPtr = this.receiver.toIR(gen, scope);
    } else {
      // Need to get address
      if (this.receiver.getAddress) {
        receiverPtr = this.receiver.getAddress(gen, scope);
      } else {
        // Fallback: evaluate to temp and get address
        const receiverVal = this.receiver.toIR(gen, scope);
        const tempPtr = gen.emitAlloca(gen.getIRType(receiverType), "receiver");
        gen.emitStore(gen.getIRType(receiverType), receiverVal, tempPtr);
        receiverPtr = tempPtr;
      }
    }

    // Prepare arguments (receiver is first)
    const argValues: { value: string; type: any }[] = [
      {
        value: receiverPtr,
        type: gen.getIRType({
          name: structName,
          isPointer: 1,
          isArray: [],
        }),
      },
    ];

    // Process remaining arguments (same logic as FunctionCallExpr)
    this.args.forEach((arg, index) => {
      let val = arg.toIR(gen, scope);
      const paramIndex = index + 1; // Offset by 1 for receiver

      let type: any;
      if (func.args && func.args[paramIndex]) {
        type = gen.getIRType(func.args[paramIndex].type);

        // Check if cast is needed
        const argType = resolveExpressionType(arg, scope);
        if (argType) {
          const argIRType = gen.getIRType(argType);
          // Apply same casting logic as FunctionCallExpr
          if (argIRType.type !== type.type) {
            val = this.applyCast(gen, val, argIRType, type);
          }
        }
      } else {
        const exprType = resolveExpressionType(arg, scope);
        type = exprType ? gen.getIRType(exprType) : { type: "i64" };

        // Array decay
        if (type.type === "array") {
          type = { type: "pointer", base: type.base };
        }
      }

      argValues.push({ value: val, type: type });
    });

    const returnType = func.returnType
      ? gen.getIRType(func.returnType)
      : IRVoid;

    const funcName = func.irName || `@${mangledName}`;
    const result = gen.emitCall(funcName, argValues, returnType);
    return result || "";
  }

  private applyCast(
    gen: IRGenerator,
    val: string,
    srcType: any,
    destType: any,
  ): string {
    const { IROpcode } = require("../../transpiler/ir/IRInstruction");

    if (srcType.type.startsWith("i") && destType.type.startsWith("i")) {
      const srcSize = parseInt(srcType.type.substring(1));
      const destSize = parseInt(destType.type.substring(1));
      if (srcSize < destSize) {
        return gen.emitCast(IROpcode.ZEXT, val, destType, srcType);
      } else if (srcSize > destSize) {
        return gen.emitCast(IROpcode.TRUNC, val, destType, srcType);
      }
    } else if (srcType.type === "pointer" && destType.type.startsWith("i")) {
      return gen.emitCast(IROpcode.PTR_TO_INT, val, destType, srcType);
    } else if (srcType.type.startsWith("i") && destType.type === "pointer") {
      return gen.emitCast(IROpcode.INT_TO_PTR, val, destType, srcType);
    } else if (srcType.type === "f32" && destType.type === "f64") {
      return gen.emitCast(IROpcode.FP_EXT, val, destType, srcType);
    } else if (srcType.type === "f64" && destType.type === "f32") {
      return gen.emitCast(IROpcode.FP_TRUNC, val, destType, srcType);
    }

    return val;
  }
}
