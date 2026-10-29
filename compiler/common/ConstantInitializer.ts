/**
 * Compile-time evaluation of global initializers.
 *
 * Globals are emitted as LLVM constants, so their initializers must reduce to
 * a value at compile time. The checker uses this to diagnose anything else up
 * front and the code generator uses the same evaluation to emit the value.
 *
 * Every operation is evaluated at the width of its checked type, so
 * `(2147483647 + 1) / 2` as `int` wraps before dividing, and every cast
 * converts its operand (`cast<int>(1.75)` is 1), as at run time.
 */

import type * as AST from "./AST";
import { TokenType } from "../frontend/TokenType";
import { getPrimitiveType, type PrimitiveTypeInfo } from "./PrimitiveTypes";

export type ConstantValue =
  | { kind: "int"; value: bigint }
  | { kind: "float"; value: number }
  | { kind: "bool"; value: boolean }
  /** Strings, chars and null literals keep their literal for emission. */
  | { kind: "literal"; expr: AST.LiteralExpr }
  | { kind: "array"; elements: ConstantValue[] };

const INTEGER_OPERATORS: Partial<
  Record<TokenType, (left: bigint, right: bigint) => bigint | undefined>
> = {
  [TokenType.Plus]: (a, b) => a + b,
  [TokenType.Minus]: (a, b) => a - b,
  [TokenType.Star]: (a, b) => a * b,
  [TokenType.Slash]: (a, b) => (b === 0n ? undefined : a / b),
  [TokenType.Percent]: (a, b) => (b === 0n ? undefined : a % b),
  [TokenType.Ampersand]: (a, b) => a & b,
  [TokenType.Pipe]: (a, b) => a | b,
  [TokenType.Caret]: (a, b) => a ^ b,
  [TokenType.LessLess]: (a, b) => (b < 0n || b > 63n ? undefined : a << b),
  [TokenType.GreaterGreater]: (a, b) =>
    b < 0n || b > 63n ? undefined : a >> b,
};

/** Evaluate a global initializer, or return undefined if it is not constant. */
export function evaluateConstantInitializer(
  expr: AST.Expression,
): ConstantValue | undefined {
  switch (expr.kind) {
    case "Group":
      return evaluateConstantInitializer(expr.expression);
    case "Literal":
      return evaluateLiteral(expr);
    case "Unary": {
      const operand = evaluateConstantInitializer(expr.operand);
      if (!operand) return undefined;
      switch (expr.operator.type) {
        case TokenType.Minus:
          if (operand.kind === "int")
            return wrapInteger(-operand.value, expr.resolvedType);
          if (operand.kind === "float")
            return { kind: "float", value: -operand.value };
          return undefined;
        case TokenType.Bang:
          return operand.kind === "bool"
            ? { kind: "bool", value: !operand.value }
            : undefined;
        case TokenType.Tilde:
          return operand.kind === "int"
            ? wrapInteger(~operand.value, expr.resolvedType)
            : undefined;
        default:
          return undefined;
      }
    }
    case "Binary": {
      const operation = INTEGER_OPERATORS[expr.operator.type];
      if (!operation) return undefined;
      const left = evaluateConstantInitializer(expr.left);
      const right = evaluateConstantInitializer(expr.right);
      if (left?.kind !== "int" || right?.kind !== "int") return undefined;
      const value = operation(left.value, right.value);
      return value === undefined
        ? undefined
        : wrapInteger(value, expr.resolvedType);
    }
    case "Cast": {
      const operand = evaluateConstantInitializer(expr.expression);
      if (operand?.kind !== "int" && operand?.kind !== "float")
        return undefined;
      return convertNumeric(operand, expr.targetType);
    }
    case "ArrayLiteral": {
      const elements: ConstantValue[] = [];
      for (const element of expr.elements) {
        const value = evaluateConstantInitializer(element);
        if (!value) return undefined;
        elements.push(value);
      }
      return { kind: "array", elements };
    }
    default:
      return undefined;
  }
}

/** Numeric scalar described by `type`, if it is one. */
function numericType(
  type: AST.TypeNode | undefined,
): PrimitiveTypeInfo | undefined {
  if (
    type?.kind !== "BasicType" ||
    type.pointerDepth > 0 ||
    type.arrayDimensions.length > 0
  ) {
    return undefined;
  }
  const info = getPrimitiveType(type.name);
  return info?.kind === "integer" || info?.kind === "float" ? info : undefined;
}

/** Two's-complement wrap to the integer type (unchanged if not known). */
function wrapInteger(
  value: bigint,
  type: AST.TypeNode | undefined,
): ConstantValue {
  const info = numericType(type);
  if (info?.kind !== "integer") return { kind: "int", value };
  return {
    kind: "int",
    value: info.signed
      ? BigInt.asIntN(info.bits, value)
      : BigInt.asUintN(info.bits, value),
  };
}

/** Convert a numeric constant as `cast<target>` does at run time. */
function convertNumeric(
  value: Extract<ConstantValue, { kind: "int" | "float" }>,
  target: AST.TypeNode,
): ConstantValue | undefined {
  const info = numericType(target);
  // Other targets (e.g. `cast<*T>(0)`) keep the value for the declared type.
  if (!info) return value;
  if (info.kind === "integer") {
    if (value.kind === "int") return wrapInteger(value.value, target);
    if (!Number.isFinite(value.value)) return undefined;
    return wrapInteger(BigInt(Math.trunc(value.value)), target);
  }
  const number = value.kind === "int" ? Number(value.value) : value.value;
  return {
    kind: "float",
    value: info.bits === 32 ? Math.fround(number) : number,
  };
}

function evaluateLiteral(expr: AST.LiteralExpr): ConstantValue | undefined {
  switch (expr.type) {
    case "number": {
      const raw = expr.raw.replace(/_/g, "");
      if (raw.includes(".")) {
        return { kind: "float", value: Number(raw) };
      }
      try {
        return { kind: "int", value: BigInt(raw) };
      } catch {
        return undefined;
      }
    }
    case "bool":
      return { kind: "bool", value: expr.value === true };
    case "string":
    case "char":
    case "null":
    case "nullptr":
      return { kind: "literal", expr };
    default:
      return undefined;
  }
}
