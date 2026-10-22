import type * as AST from "./AST";
import { CompilerError } from "./CompilerError";

export const TYPE_ALIAS_POINTER_UNSUPPORTED_CODE =
  "BPL_TYPE_ALIAS_POINTER_UNSUPPORTED";

/** Preserve value qualifiers and outer modifier order after alias expansion. */
export function applyAliasValueModifiers(
  target: AST.TypeNode,
  usage: AST.BasicTypeNode,
): AST.TypeNode {
  if (target.kind === "BasicType") {
    // Adding an array wrapper makes the previous outer pointer an element
    // pointer. Its pointee layout remains available through alias metadata.
    if (usage.arrayDimensions.length > 0 && target.isPointerToArray) {
      return {
        ...target,
        isPointerToArray: false,
        isConst: usage.isConst || target.isConst,
      };
    }
    return usage.isConst ? { ...target, isConst: true } : target;
  }
  if (usage.pointerDepth > 0) {
    throw new CompilerError(
      "Unsupported pointer to callable or tuple type alias",
      "Use a struct wrapper for pointer indirection. A Func value is already a C function pointer; pass it directly for a callback.",
      usage.location,
      TYPE_ALIAS_POINTER_UNSUPPORTED_CODE,
    );
  }
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
  return target;
}
