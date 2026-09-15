import type * as AST from "../../common/AST";
import { CompilerError, type SourceLocation } from "../../common/CompilerError";
import { getPrimitiveType } from "../../common/PrimitiveTypes";

export const EXTERN_ABI_UNSUPPORTED_CODE = "BPL_EXTERN_ABI_UNSUPPORTED";

// Matching LLVM aggregate layout does not establish the platform C call ABI.
// Reject unsupported value shapes until target-specific classification exists.
export function validateExternAbiType(
  type: AST.TypeNode,
  location: SourceLocation,
  seen = new Set<AST.TypeNode>(),
): void {
  if (seen.has(type)) return;
  seen.add(type);
  if (
    type.kind === "BasicType" &&
    type.pointerDepth > 0 &&
    (type.isPointerToArray || type.arrayDimensions.length === 0)
  )
    return;
  if (type.kind !== "MetaType" && type.arrayDimensions?.length) {
    reject(location);
  }
  if (type.kind === "FunctionType") {
    validateExternAbiType(type.returnType, location, seen);
    for (const parameter of type.paramTypes)
      validateExternAbiType(parameter, location, seen);
    return;
  }
  if (
    type.kind === "BasicType" &&
    (getPrimitiveType(type.name) ||
      type.name === "void" ||
      type.name === "string")
  )
    return;
  reject(location);
}

// Arguments beyond the fixed parameters of a direct extern variadic call.
// Code generation lowers `String` to its data pointer and payload-free enums
// to their i32 tag; generic parameters are only known after instantiation.
export function validateExternVariadicArguments(
  argTypes: (AST.TypeNode | undefined)[],
  args: AST.Expression[],
  fixedCount: number,
): void {
  for (let i = fixedCount; i < argTypes.length; i++) {
    const type = argTypes[i];
    if (!type || isLoweredVariadicArgument(type)) continue;
    validateExternAbiType(type, args[i]!.location);
  }
}

function isLoweredVariadicArgument(type: AST.TypeNode): boolean {
  if (
    type.kind !== "BasicType" ||
    type.pointerDepth > 0 ||
    type.arrayDimensions.length > 0
  )
    return false;
  if (type.name === "String") return true;
  const declaration = type.resolvedDeclaration as
    | AST.StructDecl
    | AST.EnumDecl
    | AST.SpecDecl
    | { kind: "GenericParam" }
    | undefined;
  if (declaration?.kind === "GenericParam") return true;
  return (
    declaration?.kind === "EnumDecl" &&
    declaration.genericParams.length === 0 &&
    declaration.variants.every(
      (variant) =>
        !variant.dataType || variant.dataType.kind === "EnumVariantUnit",
    )
  );
}

function reject(location: SourceLocation): never {
  throw new CompilerError(
    "Unsupported aggregate value in C ABI boundary",
    "Use scalar values or pointers and a C wrapper; aggregate arguments, results, and callback signatures require target-specific ABI lowering.",
    location,
    EXTERN_ABI_UNSUPPORTED_CODE,
  );
}
