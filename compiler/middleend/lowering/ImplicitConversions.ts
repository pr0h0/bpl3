import * as AST from "../../common/AST";

export type LoweredImplicitConversionKind =
  | "identity"
  | "integer-compatible"
  | "array-to-pointer"
  | "array-to-slice"
  | "unsupported";

export interface LoweredImplicitConversion {
  kind: LoweredImplicitConversionKind;
  targetType: AST.TypeNode;
  sourceType: AST.TypeNode;
}

const INTEGER_TYPES = new Set([
  "i8",
  "u8",
  "i16",
  "u16",
  "i32",
  "u32",
  "i64",
  "u64",
  "int",
  "uint",
  "long",
  "ulong",
  "short",
  "ushort",
  "char",
  "uchar",
]);

export function areArrayDimensionsAssignable(
  targetDimensions: (number | null)[],
  sourceDimensions: (number | null)[],
): boolean {
  if (targetDimensions.length !== sourceDimensions.length) return false;

  for (let i = 0; i < targetDimensions.length; i++) {
    const target = targetDimensions[i];
    const source = sourceDimensions[i];
    if (target === source) continue;
    if (target === null && source !== null) continue;
    return false;
  }

  return true;
}

export function isSliceTypeNode(
  type: AST.TypeNode | undefined,
): type is AST.BasicTypeNode {
  return (
    type?.kind === "BasicType" &&
    type.arrayDimensions.length > 0 &&
    type.arrayDimensions[0] === null
  );
}

export function isFixedArrayTypeNode(
  type: AST.TypeNode | undefined,
): type is AST.BasicTypeNode {
  return (
    type?.kind === "BasicType" &&
    type.arrayDimensions.length > 0 &&
    type.arrayDimensions[0] !== null
  );
}

export function lowerImplicitConversion(
  targetType: AST.TypeNode,
  sourceType: AST.TypeNode,
): LoweredImplicitConversion {
  if (areTypeNodesStructurallyEqual(targetType, sourceType)) {
    return { kind: "identity", targetType, sourceType };
  }

  if (targetType.kind !== "BasicType" || sourceType.kind !== "BasicType") {
    return { kind: "unsupported", targetType, sourceType };
  }

  if (isIntegerScalar(targetType) && isIntegerScalar(sourceType)) {
    return { kind: "integer-compatible", targetType, sourceType };
  }

  if (!sameBasicElementType(targetType, sourceType)) {
    return { kind: "unsupported", targetType, sourceType };
  }

  if (isArrayToPointerDecay(targetType, sourceType)) {
    return { kind: "array-to-pointer", targetType, sourceType };
  }

  if (isArrayToSliceConversion(targetType, sourceType)) {
    return { kind: "array-to-slice", targetType, sourceType };
  }

  return { kind: "unsupported", targetType, sourceType };
}

function sameBasicElementType(
  targetType: AST.BasicTypeNode,
  sourceType: AST.BasicTypeNode,
): boolean {
  if (targetType.name !== sourceType.name) return false;
  if (targetType.genericArgs.length !== sourceType.genericArgs.length) {
    return false;
  }

  for (let i = 0; i < targetType.genericArgs.length; i++) {
    if (
      !areTypeNodesStructurallyEqual(
        targetType.genericArgs[i]!,
        sourceType.genericArgs[i]!,
      )
    ) {
      return false;
    }
  }

  return true;
}

function isIntegerScalar(type: AST.BasicTypeNode): boolean {
  return (
    type.pointerDepth === 0 &&
    type.arrayDimensions.length === 0 &&
    INTEGER_TYPES.has(type.name)
  );
}

function isArrayToPointerDecay(
  targetType: AST.BasicTypeNode,
  sourceType: AST.BasicTypeNode,
): boolean {
  return (
    targetType.pointerDepth === sourceType.pointerDepth + 1 &&
    sourceType.arrayDimensions.length > 0 &&
    sourceType.arrayDimensions[0] !== null &&
    targetType.arrayDimensions.length === sourceType.arrayDimensions.length - 1 &&
    areArrayDimensionsExactlyEqual(
      targetType.arrayDimensions,
      sourceType.arrayDimensions.slice(1),
    )
  );
}

function isArrayToSliceConversion(
  targetType: AST.BasicTypeNode,
  sourceType: AST.BasicTypeNode,
): boolean {
  return (
    targetType.pointerDepth === sourceType.pointerDepth &&
    targetType.arrayDimensions.some((dimension) => dimension === null) &&
    sourceType.arrayDimensions.some((dimension) => dimension !== null) &&
    areArrayDimensionsAssignable(
      targetType.arrayDimensions,
      sourceType.arrayDimensions,
    )
  );
}

function areArrayDimensionsExactlyEqual(
  left: (number | null)[],
  right: (number | null)[],
): boolean {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function areTypeNodesStructurallyEqual(
  left: AST.TypeNode,
  right: AST.TypeNode,
): boolean {
  if (left.kind !== right.kind) return false;

  if (left.kind === "BasicType" && right.kind === "BasicType") {
    return (
      left.name === right.name &&
      left.pointerDepth === right.pointerDepth &&
      areArrayDimensionsExactlyEqual(
        left.arrayDimensions,
        right.arrayDimensions,
      ) &&
      left.genericArgs.length === right.genericArgs.length &&
      left.genericArgs.every((arg, index) =>
        areTypeNodesStructurallyEqual(arg, right.genericArgs[index]!),
      )
    );
  }

  if (left.kind === "TupleType" && right.kind === "TupleType") {
    return (
      left.types.length === right.types.length &&
      left.types.every((type, index) =>
        areTypeNodesStructurallyEqual(type, right.types[index]!),
      )
    );
  }

  if (left.kind === "FunctionType" && right.kind === "FunctionType") {
    return areCallableTypesStructurallyEqual(left, right);
  }

  if (left.kind === "LambdaType" && right.kind === "LambdaType") {
    return areCallableTypesStructurallyEqual(left, right);
  }

  return false;
}

function areCallableTypesStructurallyEqual(
  left: AST.FunctionTypeNode | AST.LambdaTypeNode,
  right: AST.FunctionTypeNode | AST.LambdaTypeNode,
): boolean {
  return (
    left.paramTypes.length === right.paramTypes.length &&
    left.isVariadic === right.isVariadic &&
    areTypeNodesStructurallyEqual(left.returnType, right.returnType) &&
    left.paramTypes.every((type, index) =>
      areTypeNodesStructurallyEqual(type, right.paramTypes[index]!),
    )
  );
}
