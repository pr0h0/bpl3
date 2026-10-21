import type * as AST from "./AST";
import { TokenType } from "../frontend/TokenType";

type ResolveType = (type: AST.TypeNode) => AST.TypeNode;

function borrowsStorage(
  type: AST.TypeNode | undefined,
  resolve: ResolveType,
): boolean {
  if (!type) return false;
  const resolved = resolve(type);
  return (
    ("pointerDepth" in resolved && resolved.pointerDepth > 0) ||
    ("arrayDimensions" in resolved && resolved.arrayDimensions?.[0] === null)
  );
}

/** Whether an aggregate expression refers to existing storage. */
function hasStorage(expression: AST.Expression, resolve: ResolveType): boolean {
  switch (expression.kind) {
    case "Identifier":
      return true;
    case "Group":
      return hasStorage(expression.expression, resolve);
    case "Member":
      return (
        borrowsStorage(expression.object.resolvedType, resolve) ||
        hasStorage(expression.object, resolve)
      );
    case "Index":
      return (
        !expression.operatorOverload &&
        (borrowsStorage(expression.object.resolvedType, resolve) ||
          hasStorage(expression.object, resolve))
      );
    case "Unary":
      return (
        !expression.operatorOverload &&
        expression.operator.type === TokenType.Star
      );
    case "Assignment":
      return hasStorage(expression.assignee, resolve);
    default:
      return false;
  }
}

/** Reject borrowing or writing an element held in a temporary owned array. */
export function isTemporaryArrayElement(
  expression: AST.Expression,
  resolve: ResolveType,
): boolean {
  switch (expression.kind) {
    case "Group":
      return isTemporaryArrayElement(expression.expression, resolve);
    case "Member":
      return (
        !borrowsStorage(expression.object.resolvedType, resolve) &&
        isTemporaryArrayElement(expression.object, resolve)
      );
    case "Index": {
      if (borrowsStorage(expression.object.resolvedType, resolve)) return false;
      const type = expression.object.resolvedType;
      if (!type) return false;
      const resolved = resolve(type);
      return (
        "arrayDimensions" in resolved &&
        !!resolved.arrayDimensions?.length &&
        !hasStorage(expression.object, resolve)
      );
    }
    default:
      return false;
  }
}
