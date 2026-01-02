/**
 * Code Generator Utilities
 * Helper functions and utilities for LLVM IR generation
 *
 * This module contains pure utility functions that can be used
 * by the code generator without requiring class state.
 */

import type * as AST from "../../common/AST";

/**
 * LLVM type size map for primitive types
 */
export const LLVM_TYPE_SIZES: Record<string, number> = {
  i1: 1,
  i8: 1,
  i16: 2,
  i32: 4,
  i64: 8,
  float: 4,
  double: 8,
  "i8*": 8,
  "i32*": 8,
  "i64*": 8,
  "double*": 8,
};

/**
 * Get the size in bytes of an LLVM type
 */
export function getLLVMTypeSize(llvmType: string): number {
  // Handle pointers
  if (llvmType.endsWith("*")) {
    return 8; // 64-bit pointers
  }

  return LLVM_TYPE_SIZES[llvmType] ?? 8;
}

/**
 * Get the alignment requirement for an LLVM type
 */
export function getLLVMTypeAlignment(llvmType: string): number {
  const size = getLLVMTypeSize(llvmType);
  return Math.min(size, 8); // Max alignment is 8 bytes
}

/**
 * Escape a string for LLVM IR string literal
 */
export function escapeLLVMString(str: string): string {
  let result = "";
  for (let i = 0; i < str.length; i++) {
    const c = str[i]!;
    const code = c.charCodeAt(0);
    if (code < 32 || code > 126 || c === '"' || c === "\\") {
      result += "\\" + code.toString(16).padStart(2, "0");
    } else {
      result += c;
    }
  }
  return result;
}

/**
 * Check if a type is a numeric type
 */
export function isNumericType(llvmType: string): boolean {
  return (
    llvmType.startsWith("i") || llvmType === "float" || llvmType === "double"
  );
}

/**
 * Check if a type is a floating point type
 */
export function isFloatType(llvmType: string): boolean {
  return llvmType === "float" || llvmType === "double";
}

/**
 * Check if a type is an integer type
 */
export function isIntegerType(llvmType: string): boolean {
  return /^i\d+$/.test(llvmType);
}

/**
 * Check if a type is a pointer type
 */
export function isPointerType(llvmType: string): boolean {
  return llvmType.endsWith("*");
}

/**
 * Check if a type is a struct type
 */
export function isStructType(llvmType: string): boolean {
  return llvmType.startsWith("%struct.") || llvmType.startsWith("%");
}

/**
 * Check if a type is an enum type
 */
export function isEnumType(llvmType: string): boolean {
  return llvmType.startsWith("%enum.");
}

/**
 * Get the integer bit width from an LLVM integer type
 */
export function getIntegerBitWidth(llvmType: string): number {
  const match = llvmType.match(/^i(\d+)$/);
  return match ? parseInt(match[1]!, 10) : 0;
}

/**
 * Check if a type is signed (based on BPL naming conventions)
 */
export function isSigned(typeName: string): boolean {
  return (
    typeName === "int" ||
    typeName === "i8" ||
    typeName === "i16" ||
    typeName === "i32" ||
    typeName === "i64" ||
    typeName === "char" ||
    typeName === "short" ||
    typeName === "long"
  );
}

/**
 * Generate a unique name for a monomorphized function/struct
 */
export function generateMonomorphizedName(
  baseName: string,
  typeArgs: AST.TypeNode[],
  typeToString: (t: AST.TypeNode) => string,
): string {
  if (typeArgs.length === 0) return baseName;
  const suffix = typeArgs.map((t) => typeToString(t)).join("_");
  return `${baseName}_${suffix}`;
}

/**
 * Check if a comparison operator is for equality
 */
export function isEqualityOperator(op: string): boolean {
  return op === "==" || op === "!=";
}

/**
 * Check if a comparison operator is relational
 */
export function isRelationalOperator(op: string): boolean {
  return op === "<" || op === ">" || op === "<=" || op === ">=";
}

/**
 * Get LLVM comparison predicate for integer comparison
 */
export function getIntegerComparisonPredicate(
  op: string,
  signed: boolean,
): string {
  switch (op) {
    case "==":
      return "eq";
    case "!=":
      return "ne";
    case "<":
      return signed ? "slt" : "ult";
    case ">":
      return signed ? "sgt" : "ugt";
    case "<=":
      return signed ? "sle" : "ule";
    case ">=":
      return signed ? "sge" : "uge";
    default:
      return "eq";
  }
}

/**
 * Get LLVM comparison predicate for float comparison
 */
export function getFloatComparisonPredicate(op: string): string {
  switch (op) {
    case "==":
      return "oeq";
    case "!=":
      return "one";
    case "<":
      return "olt";
    case ">":
      return "ogt";
    case "<=":
      return "ole";
    case ">=":
      return "oge";
    default:
      return "oeq";
  }
}
