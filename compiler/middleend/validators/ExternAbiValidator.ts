import type * as AST from "../../common/AST";
import { CompilerError, type SourceLocation } from "../../common/CompilerError";
import { getPrimitiveType } from "../../common/PrimitiveTypes";

export const EXTERN_ABI_UNSUPPORTED_CODE = "BPL_EXTERN_ABI_UNSUPPORTED";

export type TypeResolver = (type: AST.TypeNode) => AST.TypeNode;

/**
 * Extern signatures may pass and return scalars, pointers, payload-free enums
 * and C-compatible structs by value; code generation lowers those to the target
 * C ABI. Callback (Func) signatures and variadic externs stay scalar-only
 * because no wrapper can adapt them.
 */
export function validateExternSignature(
  decl: AST.ExternDecl,
  resolve: TypeResolver,
): void {
  const type = decl.resolvedType;
  if (!type || type.kind !== "FunctionType") return;
  const allowAggregates = !decl.isVariadic;
  for (const parameter of type.paramTypes) {
    validateValue(parameter, decl.location, resolve, allowAggregates);
  }
  validateValue(type.returnType, decl.location, resolve, allowAggregates);
}

// Scalar-only boundary: callback signatures and variadic arguments.
export function validateExternAbiType(
  type: AST.TypeNode,
  location: SourceLocation,
  seen = new Set<AST.TypeNode>(),
): void {
  if (seen.has(type)) return;
  seen.add(type);
  if (isScalarOrPointer(type)) return;
  if (type.kind === "FunctionType") {
    validateExternAbiType(type.returnType, location, seen);
    for (const parameter of type.paramTypes)
      validateExternAbiType(parameter, location, seen);
    return;
  }
  reject(location);
}

function validateValue(
  type: AST.TypeNode,
  location: SourceLocation,
  resolve: TypeResolver,
  allowAggregates: boolean,
): void {
  if (type.kind === "FunctionType") {
    validateExternAbiType(type, location);
    return;
  }
  if (isScalarOrPointer(type)) return;
  if (
    type.kind === "BasicType" &&
    type.pointerDepth === 0 &&
    type.arrayDimensions.length > 0
  ) {
    reject(location, "arrays and slices (pass a pointer)");
  }
  if (!allowAggregates) reject(location, "variadic extern signatures");
  const reason = cCompatibilityProblem(type, resolve, new Set());
  if (reason) reject(location, reason);
}

function isScalarOrPointer(type: AST.TypeNode): boolean {
  if (type.kind !== "BasicType") return false;
  if (type.pointerDepth > 0) {
    return type.isPointerToArray === true || type.arrayDimensions.length === 0;
  }
  return (
    type.arrayDimensions.length === 0 &&
    (getPrimitiveType(type.name) !== undefined ||
      type.name === "void" ||
      type.name === "string")
  );
}

function resolveDeclaration(
  type: AST.BasicTypeNode,
  resolve: TypeResolver,
): AST.BasicTypeNode["resolvedDeclaration"] {
  if (type.resolvedDeclaration) return type.resolvedDeclaration;
  try {
    const resolved = resolve({ ...type, arrayDimensions: [] });
    return resolved.kind === "BasicType"
      ? resolved.resolvedDeclaration
      : undefined;
  } catch {
    return undefined;
  }
}

/** Returns why a by-value type has no C equivalent, or undefined if it does. */
function cCompatibilityProblem(
  type: AST.TypeNode,
  resolve: TypeResolver,
  visiting: Set<AST.StructDecl>,
): string | undefined {
  if (type.kind !== "BasicType") {
    return "tuples, lambdas and other non-C value types";
  }
  if (type.pointerDepth > 0) return undefined;
  if (type.arrayDimensions.length > 0) {
    // Arrays are C-compatible as struct fields; top-level arrays are handled
    // by the caller rejecting them before reaching field validation.
    return cCompatibilityProblem(
      { ...type, arrayDimensions: [] },
      resolve,
      visiting,
    );
  }
  if (isScalarOrPointer(type)) return undefined;
  const declaration = resolveDeclaration(type, resolve);
  if (declaration?.kind === "EnumDecl") {
    const payloadFree =
      declaration.genericParams.length === 0 &&
      declaration.variants.every(
        (variant) =>
          !variant.dataType || variant.dataType.kind === "EnumVariantUnit",
      );
    return payloadFree ? undefined : `enum '${type.name}' with payloads`;
  }
  if (declaration?.kind !== "StructDecl") {
    return `type '${type.name}'`;
  }
  if (type.name === "String") return "the String struct (pass .data)";
  if (declaration.genericParams.length > 0 || type.genericArgs.length > 0) {
    return `generic struct '${type.name}'`;
  }
  if (declaration.inheritanceList.length > 0) {
    return `struct '${type.name}' with inheritance or specs`;
  }
  if (declaration.members.some((member) => member.kind === "FunctionDecl")) {
    return `struct '${type.name}' with methods`;
  }
  if (visiting.has(declaration)) return `recursive struct '${type.name}'`;
  visiting.add(declaration);
  const fields = declaration.members.filter(
    (member): member is AST.StructField => member.kind === "StructField",
  );
  if (fields.length === 0) return `empty struct '${type.name}'`;
  for (const field of fields) {
    const problem = cCompatibilityProblem(field.type, resolve, visiting);
    if (problem) return problem;
  }
  visiting.delete(declaration);
  return undefined;
}

function reject(location: SourceLocation, what?: string): never {
  throw new CompilerError(
    what
      ? `Unsupported aggregate value in C ABI boundary: ${what}`
      : "Unsupported aggregate value in C ABI boundary",
    "Extern signatures accept scalars, pointers, payload-free enums, and structs that have only C-compatible fields (no methods, specs, inheritance, or generics). Callback signatures and variadic calls accept scalars and pointers only.",
    location,
    EXTERN_ABI_UNSUPPORTED_CODE,
  );
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
