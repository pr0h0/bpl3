/**
 * Compile-time evaluation of global initializers.
 *
 * Globals are emitted as LLVM constants, so their initializers must reduce to
 * a value at compile time. The checker uses this to diagnose anything else up
 * front and the code generator uses the same evaluation to emit the value.
 *
 * Every operation is evaluated at the width of its checked type, so
 * `(2147483647 + 1) / 2` as `int` wraps before dividing; the right operand
 * takes the left operand's type; and every cast converts its operand
 * (`cast<int>(1.75)` is 1, float-to-integer saturates), as at run time.
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

/** Resolves type aliases (e.g. `type Byte = u8`) to the underlying type. */
export type ConstantTypeResolver = (type: AST.TypeNode) => AST.TypeNode;

/**
 * Evaluate a global initializer, or return undefined if it is not constant.
 * Widths come from the checked `resolvedType` of each node; `resolveType`
 * maps aliases to their primitive.
 */
export function evaluateConstantInitializer(
  expr: AST.Expression,
  resolveType: ConstantTypeResolver = (type) => type,
): ConstantValue | undefined {
  const evaluate = (inner: AST.Expression) =>
    evaluateConstantInitializer(inner, resolveType);
  const wrap = (value: bigint, type: AST.TypeNode | undefined) =>
    wrapInteger(value, numericType(type, resolveType));
  switch (expr.kind) {
    case "Group":
      return evaluate(expr.expression);
    case "Literal":
      return evaluateLiteral(expr);
    case "Unary": {
      const operand = evaluate(expr.operand);
      if (!operand) return undefined;
      switch (expr.operator.type) {
        case TokenType.Minus:
          if (operand.kind === "int")
            return wrap(-operand.value, expr.resolvedType);
          if (operand.kind === "float")
            return { kind: "float", value: -operand.value };
          return undefined;
        case TokenType.Bang:
          return operand.kind === "bool"
            ? { kind: "bool", value: !operand.value }
            : undefined;
        case TokenType.Tilde:
          return operand.kind === "int"
            ? wrap(~operand.value, expr.resolvedType)
            : undefined;
        default:
          return undefined;
      }
    }
    case "Binary": {
      const operation = INTEGER_OPERATORS[expr.operator.type];
      if (!operation) return undefined;
      const left = evaluate(expr.left);
      const right = evaluate(expr.right);
      if (left?.kind !== "int" || right?.kind !== "int") return undefined;
      // Both operands take the left operand's type, as at run time, so
      // signedness decides division, remainder and right shifts.
      const operandType = numericType(expr.left.resolvedType, resolveType);
      const a = wrapInteger(left.value, operandType).value;
      const b = wrapInteger(right.value, operandType).value;
      // MIN / -1 overflows (it traps at run time), so it is not a constant.
      if (
        operandType?.kind === "integer" &&
        operandType.signed &&
        b === -1n &&
        a === -(1n << BigInt(operandType.bits - 1)) &&
        (expr.operator.type === TokenType.Slash ||
          expr.operator.type === TokenType.Percent)
      ) {
        return undefined;
      }
      const value = operation(a, b);
      return value === undefined ? undefined : wrap(value, expr.resolvedType);
    }
    case "Cast": {
      let operand = evaluate(expr.expression);
      // `bool` converts as 0 or 1 (`cast<int>(true)` is 1).
      if (operand?.kind === "bool") {
        operand = { kind: "int", value: operand.value ? 1n : 0n };
      }
      if (operand?.kind !== "int" && operand?.kind !== "float")
        return undefined;
      return convertNumeric(operand, resolveType(expr.targetType));
    }
    case "ArrayLiteral": {
      const elements: ConstantValue[] = [];
      for (const element of expr.elements) {
        const value = evaluate(element);
        if (!value) return undefined;
        elements.push(value);
      }
      return { kind: "array", elements };
    }
    default:
      return undefined;
  }
}

/** Numeric scalar described by `type` (after alias resolution), if any. */
function numericType(
  type: AST.TypeNode | undefined,
  resolveType: ConstantTypeResolver,
): PrimitiveTypeInfo | undefined {
  if (!type) return undefined;
  const resolved = resolveType(type);
  if (
    resolved.kind !== "BasicType" ||
    resolved.pointerDepth > 0 ||
    resolved.arrayDimensions.length > 0
  ) {
    return undefined;
  }
  const info = getPrimitiveType(resolved.name);
  return info?.kind === "integer" || info?.kind === "float" ? info : undefined;
}

/** Two's-complement wrap to the integer type (unchanged if not integer). */
function wrapInteger(
  value: bigint,
  info: PrimitiveTypeInfo | undefined,
): Extract<ConstantValue, { kind: "int" }> {
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
  const info = numericType(target, (type) => type);
  if (!info) {
    // Integer to `bool` keeps the low bit (`cast<bool>(2)` is false).
    if (
      target.kind === "BasicType" &&
      target.pointerDepth === 0 &&
      target.arrayDimensions.length === 0 &&
      getPrimitiveType(target.name)?.kind === "boolean"
    ) {
      return value.kind === "int"
        ? { kind: "bool", value: (value.value & 1n) === 1n }
        : undefined;
    }
    // A pointer constant can only be null; other addresses and targets are
    // not compile-time constants.
    const isPointer = target.kind === "BasicType" && target.pointerDepth > 0;
    return isPointer && value.kind === "int" && value.value === 0n
      ? value
      : undefined;
  }
  if (info.kind === "integer") {
    if (value.kind === "int") return wrapInteger(value.value, info);
    // Float to integer saturates at the destination range; NaN becomes 0.
    if (Number.isNaN(value.value)) return { kind: "int", value: 0n };
    const min = info.signed ? -(1n << BigInt(info.bits - 1)) : 0n;
    const max = info.signed
      ? (1n << BigInt(info.bits - 1)) - 1n
      : (1n << BigInt(info.bits)) - 1n;
    if (value.value === Infinity) return { kind: "int", value: max };
    if (value.value === -Infinity) return { kind: "int", value: min };
    const truncated = BigInt(Math.trunc(value.value));
    if (truncated < min) return { kind: "int", value: min };
    if (truncated > max) return { kind: "int", value: max };
    return { kind: "int", value: truncated };
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
