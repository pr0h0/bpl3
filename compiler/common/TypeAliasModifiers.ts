import type * as AST from "./AST";

/** Preserve modifiers on aliases whose target has no BasicType wrapper. */
export function applyAliasValueModifiers(
  target: AST.TypeNode,
  usage: AST.BasicTypeNode,
): AST.TypeNode {
  if (
    target.kind === "FunctionType" ||
    target.kind === "TupleType" ||
    target.kind === "LambdaType"
  ) {
    return {
      ...target,
      arrayDimensions: [
        ...usage.arrayDimensions,
        ...(target.arrayDimensions ?? []),
      ],
      isConst: usage.isConst || target.isConst,
    };
  }
  return usage.isConst ? { ...target, isConst: true } : target;
}
