import type Token from "../../lexer/token";
import TokenType from "../../lexer/tokenType";
import { IROpcode } from "../../transpiler/ir/IRInstruction";
import ExpressionType from "../expressionType";
import BinaryExpr from "./binaryExpr";
import Expression from "./expr";
import IdentifierExpr from "./identifierExpr";
import MemberAccessExpr from "./memberAccessExpr";
import NumberLiteralExpr from "./numberLiteralExpr";

import type Scope from "../../transpiler/Scope";
import type { IRGenerator } from "../../transpiler/ir/IRGenerator";
import type { VariableType } from "./variableDeclarationExpr";

export default class UnaryExpr extends Expression {
  constructor(
    public operator: Token,
    public right: Expression,
  ) {
    super(ExpressionType.UnaryExpression);
  }

  toString(depth: number = 0): string {
    this.depth = depth;
    let output = this.getDepth();

    output += "[ Unary Expression ]\n";
    output += this.getDepth() + `Operator: ${this.operator}\n`;
    output += this.right.toString(this.depth + 1);
    output += this.getDepth() + `[/ Unary Expression ]\n`;
    return output;
  }

  optimize(): Expression {
    this.right = this.right.optimize();

    if (this.right instanceof NumberLiteralExpr) {
      const val = Number(this.right.value);
      let result: number | null = null;

      switch (this.operator.type) {
        case TokenType.MINUS:
          result = -val;
          break;
        case TokenType.PLUS:
          result = val;
          break;
        case TokenType.NOT:
          result = val === 0 ? 1 : 0;
          break;
        case TokenType.TILDE:
          result = ~val;
          break;
      }

      if (result !== null) {
        let resultStr = result.toString();
        // Handle negative zero specifically because (-0).toString() is "0"
        if (result === 0 && 1 / result === -Infinity) {
          resultStr = "-0.0";
        }
        return new NumberLiteralExpr(resultStr, this.operator);
      }
    }
    return this;
  }

  private resolveExpressionType(
    expr: Expression,
    scope: Scope,
  ): VariableType | null {
    if (expr.type === ExpressionType.IdentifierExpr) {
      const ident = expr as IdentifierExpr;
      const resolved = scope.resolve(ident.name);
      return resolved ? resolved.varType : null;
    } else if (expr.type === ExpressionType.MemberAccessExpression) {
      const memberExpr = expr as MemberAccessExpr;
      const objectType = this.resolveExpressionType(memberExpr.object, scope);
      if (!objectType) return null;

      if (memberExpr.isIndexAccess) {
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

        const propertyName = (memberExpr.property as IdentifierExpr).name;
        const member = typeInfo.members.get(propertyName);
        if (!member) return null;

        return {
          name: member.name,
          isPointer: member.isPointer,
          isArray: member.isArray,
        };
      }
    } else if (expr.type === ExpressionType.BinaryExpression) {
      const binExpr = expr as BinaryExpr;
      const leftType = this.resolveExpressionType(binExpr.left, scope);
      const rightType = this.resolveExpressionType(binExpr.right, scope);

      if (leftType && leftType.isPointer > 0) return leftType;
      if (rightType && rightType.isPointer > 0) return rightType;

      if (leftType?.name === "f64" || rightType?.name === "f64")
        return { name: "f64", isPointer: 0, isArray: [] };
      if (leftType?.name === "f32" || rightType?.name === "f32")
        return { name: "f32", isPointer: 0, isArray: [] };

      return null;
    } else if (expr.type === ExpressionType.UnaryExpression) {
      const unaryExpr = expr as UnaryExpr;
      if (unaryExpr.operator.value === "*") {
        const opType = this.resolveExpressionType(unaryExpr.right, scope);
        if (opType && opType.isPointer > 0) {
          return {
            name: opType.name,
            isPointer: opType.isPointer - 1,
            isArray: opType.isArray,
          };
        }
      } else if (unaryExpr.operator.value === "&") {
        const opType = this.resolveExpressionType(unaryExpr.right, scope);
        if (opType) {
          return {
            name: opType.name,
            isPointer: opType.isPointer + 1,
            isArray: opType.isArray,
          };
        }
      }
      return null;
    } else if (expr.type === ExpressionType.NumberLiteralExpr) {
      const numExpr = expr as NumberLiteralExpr;
      const val = numExpr.value;
      const isHexBinOct =
        val.startsWith("0x") || val.startsWith("0b") || val.startsWith("0o");
      if (
        !isHexBinOct &&
        (val.includes(".") || val.toLowerCase().includes("e"))
      ) {
        return { name: "f64", isPointer: 0, isArray: [] };
      }
      return { name: "u64", isPointer: 0, isArray: [] };
    }
    return null;
  }

  toIR(gen: IRGenerator, scope: Scope): string {
    if (this.operator.type === TokenType.AMPERSAND) {
      return this.right.getAddress(gen, scope);
    }

    if (this.operator.type === TokenType.STAR) {
      const isLHS = scope.getCurrentContext("LHS");
      if (isLHS) scope.removeCurrentContext("LHS");

      const ptr = this.right.toIR(gen, scope);

      if (isLHS) {
        scope.setCurrentContext({ type: "LHS" });
        return ptr;
      }

      const resultType = this.resolveExpressionType(this, scope);
      if (!resultType)
        throw new Error("Cannot resolve result type for dereference");

      const type = gen.getIRType(resultType);
      return gen.emitLoad(type, ptr);
    }

    const val = this.right.toIR(gen, scope);
    const type = this.resolveExpressionType(this.right, scope);
    const isFloat = type?.name === "f64" || type?.name === "f32";
    const irType = type ? gen.getIRType(type) : "i64";

    switch (this.operator.type) {
      case TokenType.MINUS:
        if (isFloat) {
          const zero = type?.name === "f32" ? "-0.0" : "-0.0";
          return gen.emitBinary(IROpcode.FSUB, irType, zero, val);
        } else {
          return gen.emitBinary("sub", irType, "0", val);
        }
      case TokenType.PLUS:
        return val;
      case TokenType.NOT: {
        const res = gen.emitBinary("eq", irType, val, "0");
        return gen.emitCast(IROpcode.ZEXT, res, { type: "i8" }, { type: "i1" });
      }
      case TokenType.TILDE: {
        return gen.emitBinary("xor", irType, val, "-1");
      }
      default:
        throw new Error(`Unsupported unary operator: ${this.operator.value}`);
    }
  }

  getAddress(gen: IRGenerator, scope: Scope): string {
    if (this.operator.type === TokenType.STAR) {
      return this.right.toIR(gen, scope);
    }
    throw new Error("Cannot take address of this unary expression");
  }
}
