import type { IRGenerator } from "../../transpiler/ir/IRGenerator";
import type Scope from "../../transpiler/Scope";
import { IROpcode } from "../../transpiler/ir/IRInstruction";
import ExpressionType from "../expressionType";
import BinaryExpr from "./binaryExpr";
import Expression from "./expr";
import IdentifierExpr from "./identifierExpr";
import UnaryExpr from "./unaryExpr";

import type { VariableType } from "./variableDeclarationExpr";
export default class MemberAccessExpr extends Expression {
  constructor(
    public object: Expression,
    public property: Expression, // since it can be identifier or expression (for index access)
    public isIndexAccess: boolean,
  ) {
    super(ExpressionType.MemberAccessExpression);
  }

  toString(depth: number = 0): string {
    this.depth = depth;
    let output = this.getDepth();
    output += "[ MemberAccess ]\n";
    this.depth++;
    output += this.object.toString(this.depth + 1);
    output +=
      this.getDepth() + `Property: \n${this.property.toString(this.depth + 1)}`;
    output += this.getDepth() + `IsIndexAccess: ${this.isIndexAccess}\n`;
    this.depth--;
    output += this.getDepth() + "/[ MemberAccess ]\n";
    return output;
  }

  private resolveExpressionType(
    expr: Expression,
    scope: Scope,
  ): VariableType | null {
    if (expr instanceof IdentifierExpr) {
      const resolved = scope.resolve(expr.name);
      return resolved ? resolved.varType : null;
    } else if (expr instanceof MemberAccessExpr) {
      const objectType = this.resolveExpressionType(expr.object, scope);
      if (!objectType) return null;

      if (expr.isIndexAccess) {
        if (objectType.isArray.length > 0) {
          return {
            name: objectType.name,
            isPointer: objectType.isPointer,
            isArray: objectType.isArray.slice(1),
          };
        } else if (objectType.isPointer > 0) {
          return {
            name: objectType.name,
            isPointer: objectType.isPointer - 1,
            isArray: [],
          };
        }
        return null;
      } else {
        let typeInfo;
        if (objectType.genericArgs && objectType.genericArgs.length > 0) {
          typeInfo = scope.resolveGenericType(
            objectType.name,
            objectType.genericArgs,
          );
        } else {
          typeInfo = scope.resolveType(objectType.name);
        }
        if (!typeInfo) return null;

        const propertyName = (expr.property as IdentifierExpr).name;
        const member = typeInfo.members.get(propertyName);
        if (!member) return null;

        return {
          name: member.name,
          isPointer: member.isPointer,
          isArray: member.isArray,
        };
      }
    } else if (expr instanceof BinaryExpr) {
      const leftType = this.resolveExpressionType(expr.left, scope);
      const rightType = this.resolveExpressionType(expr.right, scope);

      if (leftType && leftType.isPointer > 0) return leftType;
      if (rightType && rightType.isPointer > 0) return rightType;
      return null;
    } else if (expr instanceof UnaryExpr) {
      if (expr.operator.value === "*") {
        const opType = this.resolveExpressionType(expr.right, scope);
        if (opType && opType.isPointer > 0) {
          return {
            name: opType.name,
            isPointer: opType.isPointer - 1,
            isArray: opType.isArray,
          };
        }
      } else if (expr.operator.value === "&") {
        const opType = this.resolveExpressionType(expr.right, scope);
        if (opType) {
          return {
            name: opType.name,
            isPointer: opType.isPointer + 1,
            isArray: opType.isArray,
          };
        }
      }
      return null;
    }
    return null;
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
    const isLHS = scope.getCurrentContext("LHS");
    if (isLHS) scope.removeCurrentContext("LHS");

    // Handle variadic args access: args[i]
    if (
      this.object instanceof IdentifierExpr &&
      this.object.name === "args" &&
      this.isIndexAccess
    ) {
      const variadicStart = scope.resolve("__va_gp_offset__");
      const regSaveArea = scope.resolve("__va_reg_save_area__");
      const overflowArgArea = scope.resolve("__va_overflow_arg_area__");

      if (variadicStart && regSaveArea && overflowArgArea) {
        const index = this.property.toIR(gen, scope);
        const startOffset = parseInt(variadicStart.irName!); // Assuming constant for now

        // Calculate current offset: startOffset * 8 + index * 8
        const indexScaled = gen.emitBinary(IROpcode.MUL, "i64", index, "8");
        const startOffsetBytes = startOffset * 8;
        const currentOffset = gen.emitBinary(
          IROpcode.ADD,
          "i64",
          indexScaled,
          startOffsetBytes.toString(),
        );

        // Check if in registers (offset < 48)
        const inRegs = gen.emitBinary(IROpcode.LT, "i64", currentOffset, "48");
        // inRegs is i1 (from icmp)

        const labelRegs = gen.createBlock("va_regs");
        const labelStack = gen.createBlock("va_stack");
        const labelMerge = gen.createBlock("va_merge");

        const resultPtr = gen.emitAlloca(
          { type: "pointer", base: { type: "i8" } },
          "va_arg_ptr",
        );

        gen.emitCondBranch(inRegs, labelRegs.name, labelStack.name);

        // Registers
        gen.setBlock(labelRegs);
        const regAddr = gen.emitGEP({ type: "i8" }, regSaveArea.irName!, [
          currentOffset,
        ]);
        gen.emitStore(
          { type: "pointer", base: { type: "i8" } },
          regAddr,
          resultPtr,
        );
        gen.emitBranch(labelMerge.name);

        // Stack
        gen.setBlock(labelStack);
        const stackOffset = gen.emitBinary(
          IROpcode.SUB,
          "i64",
          currentOffset,
          "48",
        );
        const stackAddr = gen.emitGEP({ type: "i8" }, overflowArgArea.irName!, [
          stackOffset,
        ]);
        gen.emitStore(
          { type: "pointer", base: { type: "i8" } },
          stackAddr,
          resultPtr,
        );
        gen.emitBranch(labelMerge.name);

        gen.setBlock(labelMerge);
        const finalPtr = gen.emitLoad(
          { type: "pointer", base: { type: "i8" } },
          resultPtr,
        );

        // If !isLHS, load the value (u64)
        if (!isLHS) {
          return gen.emitLoad({ type: "i64" }, finalPtr);
        } else {
          scope.setCurrentContext({ type: "LHS" });
          return finalPtr;
        }
      }
    }

    const ptr = this.getAddress(gen, scope);

    if (isLHS) {
      scope.setCurrentContext({ type: "LHS" });
      return ptr;
    }

    const resultType = this.resolveExpressionType(this, scope);
    if (!resultType) throw new Error("Cannot resolve result type");

    if (resultType.isArray.length > 0) {
      const arrayType = gen.getIRType(resultType);
      return gen.emitGEP(arrayType, ptr, ["0", "0"]);
    }

    const type = gen.getIRType(resultType);
    return gen.emitLoad(type, ptr);
  }

  getAddress(gen: IRGenerator, scope: Scope): string {
    const objectType = this.resolveExpressionType(this.object, scope);
    if (!objectType) {
      throw new Error("Cannot resolve object type");
    }

    let basePtr: string;

    if (objectType.isPointer > 0) {
      basePtr = this.object.toIR(gen, scope);
    } else if (objectType.isArray.length > 0) {
      basePtr = this.object.toIR(gen, scope);
    } else {
      basePtr = this.object.getAddress(gen, scope);
    }

    if (this.isIndexAccess) {
      let index = this.property.toIR(gen, scope);
      const indexType = this.resolveExpressionType(this.property, scope);

      if (indexType && this.getIntSize(indexType.name) < 8) {
        const isSigned = ["i8", "i16", "i32"].includes(indexType.name);
        const opcode = isSigned ? IROpcode.SEXT : IROpcode.ZEXT;
        index = gen.emitCast(
          opcode,
          index,
          { type: "i64" },
          gen.getIRType(indexType),
        );
      }

      let elemType: VariableType;
      if (objectType.isPointer > 0) {
        elemType = { ...objectType, isPointer: objectType.isPointer - 1 };
      } else if (objectType.isArray.length > 0) {
        elemType = { ...objectType, isArray: objectType.isArray.slice(1) };
      } else {
        throw new Error("Cannot index non-pointer/non-array");
      }

      const irElemType = gen.getIRType(elemType);
      return gen.emitGEP(irElemType, basePtr, [index]);
    } else {
      const propertyName = (this.property as IdentifierExpr).name;
      let typeInfo = scope.resolveType(objectType.name);
      if (objectType.genericArgs && objectType.genericArgs.length > 0) {
        typeInfo = scope.resolveGenericType(
          objectType.name,
          objectType.genericArgs,
        );
      }

      if (!typeInfo) throw new Error(`Undefined type ${objectType.name}`);

      let memberIndex = 0;
      let found = false;
      for (const [key] of typeInfo.members) {
        if (key === propertyName) {
          found = true;
          break;
        }
        memberIndex++;
      }
      if (!found) throw new Error(`Member ${propertyName} not found`);

      const structType = gen.getIRType({
        ...objectType,
        isPointer: 0,
        isArray: [],
      });
      return gen.emitGEP(structType, basePtr, [
        { value: "0", type: "i32" },
        { value: memberIndex.toString(), type: "i32" },
      ]);
    }
  }
}
