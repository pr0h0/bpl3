import type * as AST from "./AST";
import { TokenType } from "../frontend/TokenType";

type ResolveType = (type: AST.TypeNode) => AST.TypeNode;

function borrowsStorage(
  type: AST.TypeNode | undefined,
  resolve: ResolveType,
): boolean {
  if (!type) return false;
  // A syntactic outer pointer/slice already identifies borrowed storage.
  // Reopening its generic pointee can reject supported callable containers.
  if (
    type.kind === "BasicType" &&
    type.pointerDepth > 0 &&
    type.arrayDimensions.length === 0
  )
    return true;
  if ("arrayDimensions" in type && type.arrayDimensions?.[0] === null)
    return true;
  const resolved = resolve(type);
  if ("arrayDimensions" in resolved && resolved.arrayDimensions?.[0] === null)
    return true;
  if (resolved.kind !== "BasicType" || resolved.pointerDepth === 0)
    return false;
  if (resolved.arrayDimensions.length === 0 || resolved.isPointerToArray)
    return true;
  // Aliases preserve modifier order: *Fixed points at an array, whereas
  // FixedPointer[2] is an owned array whose elements happen to be pointers.
  if (resolved.aliasDeclaration) {
    const target = resolve(
      resolved.aliasTarget ?? resolved.aliasDeclaration.type,
    );
    if (
      target.kind !== "BasicType" ||
      resolved.arrayDimensions.length !== target.arrayDimensions.length
    )
      return false;
    if (resolved.pointerDepth > target.pointerDepth) return true;
    if (resolved.pointerDepth === target.pointerDepth)
      return borrowsStorage(target, resolve);
  }
  return false;
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

/** Const aggregate bindings also protect their nested array storage. */
export function isConstantArrayStorage(
  expression: AST.Expression,
  resolve: ResolveType,
): boolean {
  if (
    expression.resolvedType &&
    "isConst" in expression.resolvedType &&
    expression.resolvedType.isConst
  )
    return true;
  if (expression.kind === "Identifier") {
    const declaration = expression.resolvedDeclaration;
    return (
      !!declaration && "isConst" in declaration && declaration.isConst === true
    );
  }
  if (expression.kind === "Group")
    return isConstantArrayStorage(expression.expression, resolve);
  if (expression.kind === "Member" || expression.kind === "Index") {
    return (
      !borrowsStorage(expression.object.resolvedType, resolve) &&
      isConstantArrayStorage(expression.object, resolve)
    );
  }
  return false;
}
