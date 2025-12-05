import ExpressionType from "../parser/expressionType";
import TokenType from "../lexer/tokenType";
import type Scope from "../transpiler/Scope";
import type Expression from "../parser/expression/expr";
import type { VariableType } from "../parser/expression/variableDeclarationExpr";

export function resolveExpressionType(
  expr: Expression,
  scope: Scope,
): VariableType | null {
  if (expr.type === ExpressionType.NumberLiteralExpr) {
    const val = (expr as any).value;
    const isHexBinOct =
      val.startsWith("0x") || val.startsWith("0b") || val.startsWith("0o");
    return !isHexBinOct &&
      (val.includes(".") || val.toLowerCase().includes("e"))
      ? { name: "f64", isPointer: 0, isArray: [] }
      : { name: "u64", isPointer: 0, isArray: [] };
  }
  if (expr.type === ExpressionType.IdentifierExpr) {
    const sym = scope.resolve((expr as any).name);
    return sym ? sym.varType : null;
  }
  if (expr.type === ExpressionType.FunctionCall) {
    const call = expr as any;
    // Use resolved return type from monomorphization if available
    if (call.resolvedReturnType) {
      return call.resolvedReturnType;
    }
    const func = scope.resolveFunction(call.functionName);
    return func ? func.returnType : null;
  }
  if (expr.type === ExpressionType.MethodCallExpr) {
    const methodCall = expr as any;
    const receiverType = resolveExpressionType(methodCall.receiver, scope);
    if (!receiverType) return null;

    let structName = receiverType.name;
    if (receiverType.genericArgs && receiverType.genericArgs.length > 0) {
      const typeInfo = scope.resolveGenericType(
        receiverType.name,
        receiverType.genericArgs,
      );
      if (typeInfo) structName = typeInfo.name;
    }

    const { mangleMethod } = require("./methodMangler");
    let mangledName = mangleMethod(structName, methodCall.methodName);

    if (methodCall.monomorphizedName) {
      mangledName = methodCall.monomorphizedName;
    }

    const func = scope.resolveFunction(mangledName);
    return func ? func.returnType : null;
  }
  if (expr.type === ExpressionType.BinaryExpression) {
    const binExpr = expr as any;

    // Comparison operators always return u8 (bool)
    const op = binExpr.operator.type;
    if (
      op === TokenType.EQUAL ||
      op === TokenType.NOT_EQUAL ||
      op === TokenType.LESS_THAN ||
      op === TokenType.LESS_EQUAL ||
      op === TokenType.GREATER_THAN ||
      op === TokenType.GREATER_EQUAL
    ) {
      return { name: "u8", isPointer: 0, isArray: [] };
    }

    const leftType = resolveExpressionType(binExpr.left, scope);
    const rightType = resolveExpressionType(binExpr.right, scope);

    if (leftType && leftType.isPointer > 0) return leftType;
    if (rightType && rightType.isPointer > 0) return rightType;

    if (binExpr.operator.type === TokenType.SLASH) {
      const leftSize = leftType ? getIntSize(leftType.name) : 8;
      const rightSize = rightType ? getIntSize(rightType.name) : 8;

      if (leftType?.name === "f64" || rightType?.name === "f64")
        return { name: "f64", isPointer: 0, isArray: [] };
      if (leftType?.name === "f32" || rightType?.name === "f32")
        return { name: "f32", isPointer: 0, isArray: [] };

      if (leftSize <= 4 && rightSize <= 4)
        return { name: "f32", isPointer: 0, isArray: [] };
      return { name: "f64", isPointer: 0, isArray: [] };
    }

    if (binExpr.operator.type === TokenType.SLASH_SLASH) {
      if (leftType?.name === "f64" || rightType?.name === "f64")
        return { name: "f64", isPointer: 0, isArray: [] };
      if (leftType?.name === "f32" || rightType?.name === "f32")
        return { name: "f32", isPointer: 0, isArray: [] };
      return leftType || { name: "u64", isPointer: 0, isArray: [] };
    }

    if (leftType?.name === "f64" || rightType?.name === "f64")
      return { name: "f64", isPointer: 0, isArray: [] };
    if (leftType?.name === "f32" || rightType?.name === "f32")
      return { name: "f32", isPointer: 0, isArray: [] };

    const isLogical = [
      TokenType.AND,
      TokenType.OR,
      TokenType.AMPERSAND,
      TokenType.PIPE,
      TokenType.CARET,
    ].includes(op);

    if (
      isLogical &&
      leftType &&
      rightType &&
      getIntSize(leftType.name) === 1 &&
      getIntSize(rightType.name) === 1
    ) {
      return { name: "u8", isPointer: 0, isArray: [] };
    }

    const leftSize = leftType ? getIntSize(leftType.name) : 8;
    const rightSize = rightType ? getIntSize(rightType.name) : 8;
    const maxSize = Math.max(leftSize, rightSize);

    if (maxSize <= 4) {
      return { name: "i32", isPointer: 0, isArray: [] };
    }

    return { name: "i64", isPointer: 0, isArray: [] };
  }
  if (expr.type === ExpressionType.MemberAccessExpression) {
    const memberExpr = expr as any;
    const objectType = resolveExpressionType(memberExpr.object, scope);
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

      const propertyName = (memberExpr.property as any).name;
      const member = typeInfo.members.get(propertyName);
      if (!member) return null;

      // If the member has genericArgs, it's a generic type that needs instantiation
      if (member.genericArgs && member.genericArgs.length > 0) {
        return {
          name: member.name,
          isPointer: member.isPointer,
          isArray: member.isArray,
          genericArgs: member.genericArgs,
        };
      }

      // Otherwise, the name might already be an instantiated type like "Inner<u64>"
      // Just return the type as-is
      return {
        name: member.name,
        isPointer: member.isPointer,
        isArray: member.isArray,
      };
    }
  }
  if (expr.type === ExpressionType.UnaryExpression) {
    const unaryExpr = expr as any;
    if (unaryExpr.operator.type === TokenType.STAR) {
      const opType = resolveExpressionType(unaryExpr.right, scope);
      if (opType && opType.isPointer > 0) {
        return {
          name: opType.name,
          isPointer: opType.isPointer - 1,
          isArray: opType.isArray,
        };
      }
    } else if (unaryExpr.operator.type === TokenType.AMPERSAND) {
      const opType = resolveExpressionType(unaryExpr.right, scope);
      if (opType) {
        return {
          name: opType.name,
          isPointer: opType.isPointer + 1,
          isArray: opType.isArray,
        };
      }
    } else if (unaryExpr.operator.type === TokenType.NOT) {
      return { name: "u8", isPointer: 0, isArray: [] };
    }
    // Handle other unary ops if needed (e.g. MINUS preserves type)
    return resolveExpressionType(unaryExpr.right, scope);
  }
  if (expr.type === ExpressionType.StringLiteralExpr) {
    return { name: "u8", isPointer: 1, isArray: [] };
  }
  if (expr.type === ExpressionType.TernaryExpression) {
    const ternaryExpr = expr as any;
    const trueType = resolveExpressionType(ternaryExpr.trueExpr, scope);
    if (trueType) return trueType;
    return resolveExpressionType(ternaryExpr.falseExpr, scope);
  }
  return null;
}

export function getIntSize(typeName: string): number {
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
    case "f32":
      return 4;
    case "f64":
      return 8;
    default:
      return 8;
  }
}
