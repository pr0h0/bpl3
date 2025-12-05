import { IRGenerator } from "../../transpiler/ir/IRGenerator";
import Scope from "../../transpiler/Scope";
import type { TypeInfo } from "../../transpiler/Scope";
import Token from "../../lexer/token";
import type { VariableType } from "./variableDeclarationExpr";
import ExpressionType from "../expressionType";
import Expression from "./expr";

export class SizeofExpr extends Expression {
  constructor(
    public typeArg: VariableType,
    public token: Token,
  ) {
    super(ExpressionType.SizeOfExpression);
  }

  toIR(gen: IRGenerator, scope: Scope): string {
    let typeInfo: TypeInfo | null = null;

    if (this.typeArg.genericArgs && this.typeArg.genericArgs.length > 0) {
      typeInfo = scope.resolveGenericType(
        this.typeArg.name,
        this.typeArg.genericArgs,
      );
    } else {
      typeInfo = scope.resolveType(this.typeArg.name);
    }

    if (!typeInfo) {
      throw new Error(`Type ${this.typeArg.name} not found.`);
    }

    // Handle pointers and arrays which modify the base type size
    if (this.typeArg.isPointer > 0) {
      return "8"; // Pointer size
    }

    if (this.typeArg.isArray.length > 0) {
      // Create a temporary TypeInfo for the array
      const arrayTypeInfo = { ...typeInfo, isArray: this.typeArg.isArray };
      const size = scope.calculateSizeOfType(arrayTypeInfo);
      return size.toString();
    }

    const size = scope.calculateSizeOfType(typeInfo);
    return size.toString();
  }
}
