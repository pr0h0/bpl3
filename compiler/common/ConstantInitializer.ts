/**
 * Compile-time evaluation of global initializers.
 *
 * Globals are emitted as LLVM constants, so their initializers must reduce to
 * a value at compile time. The checker uses this to diagnose anything else up
 * front and the code generator uses the same evaluation to emit the value.
 */

import type * as AST from "./AST";
import { TokenType } from "../frontend/TokenType";

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
            return { kind: "int", value: -operand.value };
          if (operand.kind === "float")
            return { kind: "float", value: -operand.value };
          return undefined;
        case TokenType.Bang:
          return operand.kind === "bool"
            ? { kind: "bool", value: !operand.value }
            : undefined;
        case TokenType.Tilde:
          return operand.kind === "int"
            ? { kind: "int", value: ~operand.value }
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
      return value === undefined ? undefined : { kind: "int", value };
    }
    case "Cast": {
      // A numeric constant converts to the declared numeric type when emitted.
      const operand = evaluateConstantInitializer(expr.expression);
      return operand?.kind === "int" || operand?.kind === "float"
        ? operand
        : undefined;
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
