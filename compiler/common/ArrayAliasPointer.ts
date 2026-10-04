import type * as AST from "./AST";

/** Recover the outer pointer added to a resolved array alias.
 * Flattened dimensions alone cannot distinguish *Row from an array of pointers.
 */
export function getArrayAliasPointer(
  type: AST.BasicTypeNode,
): { target: AST.BasicTypeNode; depth: number } | undefined {
  if (!type.arrayDimensions.length || !type.aliasDeclaration) return undefined;
  const target =
    type.aliasTarget ??
    type.aliasDeclaration.type.resolvedType ??
    type.aliasDeclaration.type;
  if (target.kind !== "BasicType") return undefined;
  const depth = type.pointerDepth - target.pointerDepth;
  if (
    depth < 0 ||
    type.arrayDimensions.length !== target.arrayDimensions.length ||
    type.arrayDimensions.some(
      (size, index) => size !== target.arrayDimensions[index],
    )
  )
    return undefined;
  return depth > 0 ? { target, depth } : getArrayAliasPointer(target);
}
