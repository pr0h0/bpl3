/**
 * Type utility functions for the BPL type checker
 * Provides type comparison, resolution, and conversion utilities
 */

import * as AST from "../common/AST";
import { CompilerError, type SourceLocation } from "../common/CompilerError";
import { TokenType } from "../frontend/TokenType";
import type { SymbolTable } from "./SymbolTable";

/**
 * Integer type names for type checking
 */
export const INTEGER_TYPES = [
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
];

/**
 * Numeric type names for casting
 */
export const NUMERIC_TYPES = [
  "int",
  "uint",
  "float",
  "double",
  "bool",
  "char",
  "uchar",
  "short",
  "ushort",
  "long",
  "ulong",
  "i8",
  "u8",
  "i16",
  "u16",
  "i32",
  "u32",
  "i64",
  "u64",
];

/**
 * Known primitive types for type matching
 */
export const KNOWN_TYPES = [
  "int",
  "i1",
  "i8",
  "i16",
  "i32",
  "i64",
  "u8",
  "u16",
  "u32",
  "u64",
  "float",
  "double",
  "bool",
  "char",
  "void",
  "string",
];

/**
 * Type utilities class providing static methods for type operations
 */
export class TypeUtils {
  /**
   * Check if a type is a numeric type (integer or float)
   */
  static isNumericType(type: AST.TypeNode): boolean {
    if (type.kind !== "BasicType") return false;
    if (type.pointerDepth > 0 || type.arrayDimensions.length > 0) return false;
    return NUMERIC_TYPES.includes(type.name);
  }

  /**
   * Convert a type node to a human-readable string representation
   */
  static typeToString(type: AST.TypeNode | undefined): string {
    if (!type) return "unknown";

    if (type.kind === "BasicType") {
      let result = "*".repeat(type.pointerDepth) + type.name;
      if (type.genericArgs.length > 0) {
        result +=
          "<" +
          type.genericArgs.map((t) => TypeUtils.typeToString(t)).join(", ") +
          ">";
      }
      if (type.arrayDimensions.length > 0) {
        result += type.arrayDimensions
          .map((d) => (d ? `[${d}]` : "[]"))
          .join("");
      }
      return result;
    } else if (type.kind === "FunctionType") {
      const params = type.paramTypes
        .map((p) => TypeUtils.typeToString(p))
        .join(", ");
      return `Func<${TypeUtils.typeToString(type.returnType)}>(${params})`;
    } else if (type.kind === "LambdaType") {
      const params = type.paramTypes
        .map((p) => TypeUtils.typeToString(p))
        .join(", ");
      return `Lambda<${TypeUtils.typeToString(type.returnType)}>(${params})`;
    } else if (type.kind === "TupleType") {
      return (
        "(" + type.types.map((t) => TypeUtils.typeToString(t)).join(", ") + ")"
      );
    }
    return "unknown";
  }

  /**
   * Check if a type is an integer type
   */
  static isIntegerType(type: AST.TypeNode): boolean {
    if (type.kind !== "BasicType") return false;
    if (type.pointerDepth > 0) return false;
    return INTEGER_TYPES.includes(type.name);
  }

  /**
   * Check if a type is a signed integer type
   */
  static isSignedInteger(type: AST.TypeNode): boolean {
    if (type.kind !== "BasicType") return false;
    if (type.pointerDepth > 0) return false;
    return ["i8", "i16", "i32", "i64", "char", "short", "int", "long"].includes(
      type.name,
    );
  }

  /**
   * Check if a type is an unsigned integer type
   */
  static isUnsignedInteger(type: AST.TypeNode): boolean {
    if (type.kind !== "BasicType") return false;
    if (type.pointerDepth > 0) return false;
    return [
      "u8",
      "u16",
      "u32",
      "u64",
      "uchar",
      "ushort",
      "uint",
      "ulong",
    ].includes(type.name);
  }

  /**
   * Check if a token type represents a comparison operator
   */
  static isComparisonOperator(op: TokenType): boolean {
    return [
      TokenType.EqualEqual,
      TokenType.BangEqual,
      TokenType.Less,
      TokenType.LessEqual,
      TokenType.Greater,
      TokenType.GreaterEqual,
    ].includes(op);
  }

  /**
   * Check if a type is boolean
   */
  static isBoolType(type: AST.TypeNode): boolean {
    return (
      type.kind === "BasicType" &&
      (type.name === "bool" || type.name === "i1") &&
      type.pointerDepth === 0
    );
  }

  /**
   * Create a void type node
   */
  static makeVoidType(location?: SourceLocation): AST.TypeNode {
    return {
      kind: "BasicType",
      name: "void",
      genericArgs: [],
      pointerDepth: 0,
      arrayDimensions: [],
      location: location || {
        file: "unknown",
        startLine: 0,
        startColumn: 0,
        endLine: 0,
        endColumn: 0,
      },
    };
  }

  /**
   * Get the size in bits of an integer type (including bool/i1)
   */
  static getIntegerBits(typeName: string): number {
    const aliases: { [key: string]: string } = {
      long: "i64",
      ulong: "u64",
      int: "i32",
      uint: "u32",
      short: "i16",
      ushort: "u16",
      char: "i8",
      uchar: "u8",
      bool: "i1",
    };
    const name = aliases[typeName] || typeName;
    if (name === "i1") return 1;
    if (name === "i8" || name === "u8") return 8;
    if (name === "i16" || name === "u16") return 16;
    if (name === "i32" || name === "u32") return 32;
    if (name === "i64" || name === "u64") return 64;
    return 0;
  }

  /**
   * Get the size in bytes of an integer type
   */
  static getIntegerSize(type: AST.TypeNode): number {
    if (!TypeUtils.isIntegerType(type)) return 0;
    const name = (type as AST.BasicTypeNode).name;
    if (["i8", "u8", "char", "uchar"].includes(name)) return 1;
    if (["i16", "u16", "short", "ushort"].includes(name)) return 2;
    if (["i32", "u32", "int", "uint"].includes(name)) return 4;
    if (["i64", "u64", "long", "ulong"].includes(name)) return 8;
    return 4; // Default
  }

  /**
   * Get the integer constant value from an expression if it's a constant
   */
  static getIntegerConstantValue(expr: AST.Expression): bigint | undefined {
    if (
      expr.kind === "Literal" &&
      (expr as AST.LiteralExpr).type === "number"
    ) {
      try {
        return BigInt((expr as AST.LiteralExpr).raw);
      } catch {
        return undefined;
      }
    }
    if (expr.kind === "Unary" && expr.operator.type === TokenType.Minus) {
      const val = TypeUtils.getIntegerConstantValue(expr.operand);
      if (val !== undefined) return -val;
    }
    return undefined;
  }

  /**
   * Check if an integer value fits within a target type's range
   */
  static isIntegerTypeCompatible(
    val: bigint,
    targetType: AST.TypeNode,
    resolveType: (type: AST.TypeNode) => AST.TypeNode,
  ): boolean {
    const resolvedTarget = resolveType(targetType);
    if (resolvedTarget.kind !== "BasicType") return false;

    // Check if target is integer type
    if (!INTEGER_TYPES.includes(resolvedTarget.name)) return false;

    let min = 0n;
    let max = 0n;

    switch (resolvedTarget.name) {
      case "i8":
      case "char":
        min = -128n;
        max = 127n;
        break;
      case "u8":
      case "uchar":
        min = 0n;
        max = 255n;
        break;
      case "i16":
      case "short":
        min = -32768n;
        max = 32767n;
        break;
      case "u16":
      case "ushort":
        min = 0n;
        max = 65535n;
        break;
      case "i32":
      case "int":
        min = -2147483648n;
        max = 2147483647n;
        break;
      case "u32":
      case "uint":
        min = 0n;
        max = 4294967295n;
        break;
      case "i64":
      case "long":
        min = -9223372036854775808n;
        max = 9223372036854775807n;
        break;
      case "u64":
      case "ulong":
        min = 0n;
        max = 18446744073709551615n;
        break;
      default:
        return false;
    }

    return val >= min && val <= max;
  }

  /**
   * Check if implicit widening is allowed between two types
   */
  static isImplicitWideningAllowed(
    source: AST.TypeNode,
    target: AST.TypeNode,
    resolveType: (t: AST.TypeNode) => AST.TypeNode,
  ): boolean {
    const rs = resolveType(source);
    const rt = resolveType(target);

    if (rs.kind !== "BasicType" || rt.kind !== "BasicType") return false;
    if (rs.pointerDepth !== 0 || rt.pointerDepth !== 0) return false;

    const sourceSize = TypeUtils.getIntegerSize(rs);
    const targetSize = TypeUtils.getIntegerSize(rt);

    if (sourceSize === 0 || targetSize === 0) return false;

    // Same signedness, target larger or equal
    const sourceIsSigned = TypeUtils.isSignedInteger(rs);
    const targetIsSigned = TypeUtils.isSignedInteger(rt);

    if (sourceIsSigned === targetIsSigned && targetSize >= sourceSize) {
      return true;
    }

    // Unsigned to larger signed is also allowed
    if (!sourceIsSigned && targetIsSigned && targetSize > sourceSize) {
      return true;
    }

    return false;
  }
}

/**
 * Type comparison utilities
 */
export class TypeComparison {
  private scope: SymbolTable;
  private resolveTypeFn: (
    type: AST.TypeNode,
    checkConstraints?: boolean,
  ) => AST.TypeNode;
  private isStructTypeFn: (typeName: string) => boolean;
  private isSubtypeFn: (
    child: AST.BasicTypeNode,
    parent: AST.BasicTypeNode,
  ) => boolean;

  constructor(
    scope: SymbolTable,
    resolveType: (
      type: AST.TypeNode,
      checkConstraints?: boolean,
    ) => AST.TypeNode,
    isStructType: (typeName: string) => boolean,
    isSubtype: (child: AST.BasicTypeNode, parent: AST.BasicTypeNode) => boolean,
  ) {
    this.scope = scope;
    this.resolveTypeFn = resolveType;
    this.isStructTypeFn = isStructType;
    this.isSubtypeFn = isSubtype;
  }

  /**
   * Check if two types are exactly the same without any implicit conversions.
   * Used for overload resolution to prefer exact matches.
   */
  areTypesExactMatch(t1: AST.TypeNode, t2: AST.TypeNode): boolean {
    const rt1 = this.resolveTypeFn(t1);
    const rt2 = this.resolveTypeFn(t2);

    if (rt1.kind !== rt2.kind) return false;

    if (rt1.kind === "BasicType" && rt2.kind === "BasicType") {
      // Exact name match (no normalization)
      if (rt1.name !== rt2.name) return false;

      // Exact pointer depth match
      if (rt1.pointerDepth !== rt2.pointerDepth) return false;

      // Exact array dimensions match
      if (rt1.arrayDimensions.length !== rt2.arrayDimensions.length)
        return false;
      for (let i = 0; i < rt1.arrayDimensions.length; i++) {
        if (rt1.arrayDimensions[i] !== rt2.arrayDimensions[i]) return false;
      }

      // Exact generic args match
      if (rt1.genericArgs.length !== rt2.genericArgs.length) return false;
      for (let i = 0; i < rt1.genericArgs.length; i++) {
        if (!this.areTypesExactMatch(rt1.genericArgs[i]!, rt2.genericArgs[i]!))
          return false;
      }

      return true;
    } else if (rt1.kind === "FunctionType" && rt2.kind === "FunctionType") {
      if (!this.areTypesExactMatch(rt1.returnType, rt2.returnType))
        return false;
      if (rt1.paramTypes.length !== rt2.paramTypes.length) return false;
      for (let i = 0; i < rt1.paramTypes.length; i++) {
        if (!this.areTypesExactMatch(rt1.paramTypes[i]!, rt2.paramTypes[i]!))
          return false;
      }
      return true;
    } else if (rt1.kind === "TupleType" && rt2.kind === "TupleType") {
      if (rt1.types.length !== rt2.types.length) return false;
      for (let i = 0; i < rt1.types.length; i++) {
        if (!this.areTypesExactMatch(rt1.types[i]!, rt2.types[i]!))
          return false;
      }
      return true;
    }

    return false;
  }

  /**
   * Check if two types are compatible (may involve implicit conversions)
   */
  areTypesCompatible(
    t1: AST.TypeNode,
    t2: AST.TypeNode,
    checkConstraints: boolean = true,
  ): boolean {
    const rt1 = this.resolveTypeFn(t1, checkConstraints);
    const rt2 = this.resolveTypeFn(t2, checkConstraints);

    // 1. Check basic kind
    if (rt1.kind !== rt2.kind) {
      // Allow FunctionType vs LambdaType compatibility check
      const isFuncOrLambda1 =
        rt1.kind === "FunctionType" || rt1.kind === "LambdaType";
      const isFuncOrLambda2 =
        rt2.kind === "FunctionType" || rt2.kind === "LambdaType";

      if (!isFuncOrLambda1 || !isFuncOrLambda2) {
        return false;
      }
    }

    // 2. Handle BasicType
    if (rt1.kind === "BasicType" && rt2.kind === "BasicType") {
      // nullptr handling - compatible with any pointer type
      if (rt1.name === "nullptr" && rt2.name === "nullptr") return true;
      if (rt2.name === "nullptr") {
        return rt1.pointerDepth > 0;
      }
      if (rt1.name === "nullptr") {
        return rt2.pointerDepth > 0;
      }

      // null handling - compatible with any pointer type or struct/object values (non-pointers)
      if (rt1.name === "null" || rt2.name === "null") {
        const other = rt1.name === "null" ? rt2 : rt1;
        if (other.pointerDepth > 0) return true;
        return other.pointerDepth === 0 && this.isStructTypeFn(other.name);
      }

      // Void handling
      if (rt1.name === "void" && rt2.name === "void") return true;

      // Allow bidirectional void* compatibility with all pointer types
      if (
        (rt1.name === "void" || rt2.name === "void") &&
        rt1.pointerDepth > 0 &&
        rt2.pointerDepth > 0
      ) {
        return true;
      }

      // Exact name match
      if (rt1.name !== rt2.name) {
        // Check inheritance
        if (
          !this.isSubtypeFn(rt2 as AST.BasicTypeNode, rt1 as AST.BasicTypeNode)
        ) {
          return false;
        }
      }

      // Check generic arguments compatibility
      const symbol1 = this.scope.resolve(rt1.name);
      let isWildcard = false;
      if (
        symbol1 &&
        symbol1.kind === "Struct" &&
        (symbol1.declaration as AST.StructDecl).genericParams.length > 0 &&
        rt1.genericArgs.length === 0
      ) {
        isWildcard = true;
      }

      // Pointer depth match or array decay
      if (rt1.pointerDepth !== rt2.pointerDepth) {
        if (
          rt1.pointerDepth === rt2.pointerDepth + 1 &&
          rt2.arrayDimensions.length > 0 &&
          rt1.arrayDimensions.length === rt2.arrayDimensions.length - 1
        ) {
          // Array decay to pointer - allowed
        } else {
          return false;
        }
      } else {
        // pointerDepth matches, check array dimensions strictly
        if (rt1.arrayDimensions.length !== rt2.arrayDimensions.length) {
          return false;
        }
        for (let i = 0; i < rt1.arrayDimensions.length; i++) {
          if (rt1.arrayDimensions[i] !== rt2.arrayDimensions[i]) {
            return false;
          }
        }
      }

      // Generic args match
      if (!isWildcard) {
        if (rt1.genericArgs.length !== rt2.genericArgs.length) {
          return false;
        }
        for (let i = 0; i < rt1.genericArgs.length; i++) {
          if (
            !this.areTypesCompatible(rt1.genericArgs[i]!, rt2.genericArgs[i]!)
          ) {
            return false;
          }
        }
      }

      return true;
    } else if (
      (rt1.kind === "FunctionType" || rt1.kind === "LambdaType") &&
      (rt2.kind === "FunctionType" || rt2.kind === "LambdaType")
    ) {
      console.error(`Checking compatibility: ${rt1.kind} vs ${rt2.kind}`);
      // Func <- Lambda : Error (unless stateless, but that's handled by checkLambda returning Func)
      if (rt1.kind === "FunctionType" && rt2.kind === "LambdaType") {
        console.error("Func <- Lambda is not allowed");
        return false;
      }

      const f1 = rt1 as AST.FunctionTypeNode | AST.LambdaTypeNode;
      const f2 = rt2 as AST.FunctionTypeNode | AST.LambdaTypeNode;

      if (!this.areTypesCompatible(f1.returnType, f2.returnType)) {
        console.error("Return types incompatible");
        return false;
      }
      if (f1.paramTypes.length !== f2.paramTypes.length) {
        console.error("Param length mismatch");
        return false;
      }
      for (let i = 0; i < f1.paramTypes.length; i++) {
        if (!this.areTypesCompatible(f1.paramTypes[i]!, f2.paramTypes[i]!)) {
          console.error(`Param ${i} incompatible`);
          return false;
        }
      }
      return true;
    } else if (rt1.kind === "TupleType" && rt2.kind === "TupleType") {
      if (rt1.types.length !== rt2.types.length) return false;
      for (let i = 0; i < rt1.types.length; i++) {
        if (!this.areTypesCompatible(rt1.types[i]!, rt2.types[i]!))
          return false;
      }
      return true;
    }

    return false;
  }

  /**
   * Check if a cast from source to target type is allowed
   */
  isCastAllowed(source: AST.TypeNode, target: AST.TypeNode): boolean {
    const resolvedSource = this.resolveTypeFn(source);
    const resolvedTarget = this.resolveTypeFn(target);

    if (this.areTypesCompatible(resolvedSource, resolvedTarget)) return true;

    if (
      resolvedSource.kind === "BasicType" &&
      resolvedTarget.kind === "BasicType"
    ) {
      // Numeric casts
      if (
        NUMERIC_TYPES.includes(resolvedSource.name) &&
        NUMERIC_TYPES.includes(resolvedTarget.name) &&
        resolvedSource.pointerDepth === 0 &&
        resolvedTarget.pointerDepth === 0
      ) {
        return true;
      }

      // Pointer casts
      if (resolvedSource.pointerDepth > 0 && resolvedTarget.pointerDepth > 0) {
        return true; // Allow any pointer cast for now (unsafe)
      }

      // Pointer to int / int to pointer
      const integerCastTypes = [
        "i64",
        "u64",
        "long",
        "ulong",
        "int",
        "uint",
        "i32",
        "u32",
      ];
      if (
        (resolvedSource.pointerDepth > 0 &&
          integerCastTypes.includes(resolvedTarget.name)) ||
        (resolvedTarget.pointerDepth > 0 &&
          integerCastTypes.includes(resolvedSource.name))
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if implicit widening from source to target type is allowed
   */
  isImplicitWideningAllowed(
    source: AST.TypeNode,
    target: AST.TypeNode,
  ): boolean {
    const resolvedSource = this.resolveTypeFn(source);
    const resolvedTarget = this.resolveTypeFn(target);

    if (
      resolvedSource.kind !== "BasicType" ||
      resolvedTarget.kind !== "BasicType"
    )
      return false;
    if (resolvedSource.pointerDepth > 0 || resolvedTarget.pointerDepth > 0)
      return false;
    if (
      resolvedSource.arrayDimensions.length > 0 ||
      resolvedTarget.arrayDimensions.length > 0
    )
      return false;

    const sName = (resolvedSource as AST.BasicTypeNode).name;
    const tName = (resolvedTarget as AST.BasicTypeNode).name;

    const rank: { [key: string]: number } = {
      i1: 1,
      bool: 1,
      i8: 8,
      u8: 8,
      char: 8,
      uchar: 8,
      i16: 16,
      u16: 16,
      short: 16,
      ushort: 16,
      i32: 32,
      u32: 32,
      int: 32,
      uint: 32,
      i64: 64,
      u64: 64,
      long: 64,
      ulong: 64,
    };

    const sRank = rank[sName];
    const tRank = rank[tName];

    if (!sRank || !tRank) return false;

    // Allow widening
    if (sRank < tRank) return true;

    // Allow implicit downsizing from i64/long to int/i32 (common for sizeof results)
    if (
      (sName === "i64" || sName === "long") &&
      (tName === "int" || tName === "i32")
    ) {
      return true;
    }

    // Allow implicit downsizing from u64/ulong to uint/u32
    if (
      (sName === "u64" || sName === "ulong") &&
      (tName === "uint" || tName === "u32")
    ) {
      return true;
    }

    return false;
  }
}

/**
 * Type substitution utilities for generic types
 */
export class TypeSubstitution {
  /**
   * Substitute type parameters with concrete types
   */
  static substituteType(
    type: AST.TypeNode,
    map: Map<string, AST.TypeNode>,
  ): AST.TypeNode {
    if (type.kind === "BasicType") {
      if (map.has(type.name)) {
        const subst = map.get(type.name)!;
        if (subst.kind === "BasicType") {
          return {
            ...subst,
            pointerDepth: subst.pointerDepth + type.pointerDepth,
            arrayDimensions: [
              ...subst.arrayDimensions,
              ...type.arrayDimensions,
            ],
            location: type.location,
            resolvedDeclaration: subst.resolvedDeclaration,
          };
        }
        return subst;
      }

      if (type.genericArgs.length > 0) {
        return {
          ...type,
          genericArgs: type.genericArgs.map((arg) =>
            TypeSubstitution.substituteType(arg, map),
          ),
          resolvedDeclaration: type.resolvedDeclaration,
        };
      }
    } else if (type.kind === "TupleType") {
      return {
        ...type,
        types: type.types.map((t) => TypeSubstitution.substituteType(t, map)),
      };
    } else if (type.kind === "FunctionType") {
      return {
        ...type,
        returnType: TypeSubstitution.substituteType(type.returnType, map),
        paramTypes: type.paramTypes.map((t) =>
          TypeSubstitution.substituteType(t, map),
        ),
      };
    } else if (type.kind === "LambdaType") {
      return {
        ...type,
        returnType: TypeSubstitution.substituteType(type.returnType, map),
        paramTypes: type.paramTypes.map((t) =>
          TypeSubstitution.substituteType(t, map),
        ),
      };
    } else if (type.kind === "MetaType") {
      return {
        ...type,
        type: TypeSubstitution.substituteType((type as any).type, map),
      } as any;
    }

    return type;
  }
}
