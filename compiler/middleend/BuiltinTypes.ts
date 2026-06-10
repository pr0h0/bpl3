/**
 * Builtin type initialization for the BPL type checker
 * Provides base types, type aliases, and built-in struct definitions
 */

import * as AST from "../common/AST";
import type { SymbolTable } from "./SymbolTable";
import type { SourceLocation } from "../common/CompilerError";

/**
 * Internal location used for builtin type definitions
 */
export const INTERNAL_LOCATION: SourceLocation = {
  file: "internal",
  startLine: 0,
  startColumn: 0,
  endLine: 0,
  endColumn: 0,
};

/**
 * Base types that are fundamental to the language
 */
export const BASE_TYPES = [
  "i1",
  "i8",
  "u8",
  "i16",
  "u16",
  "i32",
  "u32",
  "i64",
  "u64",
  "double",
  "void",
  "null",
  "nullptr",
];

/**
 * Type aliases mapping user-friendly names to their underlying types
 */
export const TYPE_ALIASES: [string, string][] = [
  ["int", "i32"],
  ["uint", "u32"],
  ["float", "double"],
  ["bool", "i1"],
  ["char", "i8"],
  ["uchar", "u8"],
  ["short", "i16"],
  ["ushort", "u16"],
  ["long", "i64"],
  ["ulong", "u64"],
];

/**
 * Mapping from primitive types to their struct wrappers
 */
export const PRIMITIVE_STRUCT_MAP: Record<string, string> = {
  i32: "Int",
  int: "Int",
  i1: "Bool",
  bool: "Bool",
  double: "Double",
  float: "Double",
  i64: "Long",
  long: "Long",
  i8: "Char",
  char: "Char",
  u8: "UChar",
  uchar: "UChar",
  i16: "Short",
  short: "Short",
  u16: "UShort",
  ushort: "UShort",
  u32: "UInt",
  uint: "UInt",
  u64: "ULong",
  ulong: "ULong",
};

/**
 * Create a basic type node
 */
export function createBasicType(
  name: string,
  options?: {
    pointerDepth?: number;
    genericArgs?: AST.TypeNode[];
    arrayDimensions?: number[];
    location?: SourceLocation;
  },
): AST.BasicTypeNode {
  if (options === undefined) {
    return {
      kind: "BasicType",
      name,
      genericArgs: [],
      pointerDepth: 0,
      arrayDimensions: [],
      location: INTERNAL_LOCATION,
    };
  }

  return {
    kind: "BasicType",
    name,
    genericArgs: options.genericArgs || [],
    pointerDepth: options.pointerDepth || 0,
    arrayDimensions: options.arrayDimensions || [],
    location: options.location || INTERNAL_LOCATION,
  };
}

/**
 * Create the NullAccessError struct declaration
 */
export function createNullAccessErrorDecl(): AST.StructDecl {
  return {
    kind: "StructDecl",
    name: "NullAccessError",
    genericParams: [],
    inheritanceList: [],
    members: [
      {
        kind: "StructField",
        name: "_vtable",
        type: createBasicType("i8", { pointerDepth: 1 }),
        location: INTERNAL_LOCATION,
      },
      {
        kind: "StructField",
        name: "message",
        type: createBasicType("String"),
        location: INTERNAL_LOCATION,
      },
      {
        kind: "StructField",
        name: "code",
        type: createBasicType("i32"),
        location: INTERNAL_LOCATION,
      },
      {
        kind: "StructField",
        name: "stack_frames",
        type: createBasicType("i8", { pointerDepth: 2 }), // i8**
        location: INTERNAL_LOCATION,
      },
      {
        kind: "StructField",
        name: "stack_depth",
        type: createBasicType("i32"),
        location: INTERNAL_LOCATION,
      },
      {
        kind: "StructField",
        name: "function",
        type: createBasicType("String"),
        location: INTERNAL_LOCATION,
      },
      {
        kind: "StructField",
        name: "expression",
        type: createBasicType("String"),
        location: INTERNAL_LOCATION,
      },
      {
        kind: "StructField",
        name: "line",
        type: createBasicType("i32"),
        location: INTERNAL_LOCATION,
      },
      {
        kind: "StructField",
        name: "column",
        type: createBasicType("i32"),
        location: INTERNAL_LOCATION,
      },
    ],
    location: INTERNAL_LOCATION,
  };
}

/**
 * Create the Type struct declaration (Root of type hierarchy)
 */
export function createTypeStructDecl(): AST.StructDecl {
  const typeType = createBasicType("Type", { pointerDepth: 1 });
  const stringType = createBasicType("string");
  const voidType = createBasicType("void");

  // getTypeName method
  const getTypeNameMethod: AST.FunctionDecl = {
    kind: "FunctionDecl",
    isFrame: true,
    isStatic: false,
    name: "getTypeName",
    attributes: [],
    genericParams: [],
    params: [
      {
        kind: "Parameter",
        name: "this",
        type: typeType,
        location: INTERNAL_LOCATION,
      },
    ],
    returnType: stringType,
    resolvedType: {
      kind: "FunctionType",
      returnType: stringType,
      paramTypes: [typeType],
      location: INTERNAL_LOCATION,
    },
    body: {
      kind: "Block",
      statements: [
        {
          kind: "Return",
          value: {
            kind: "Literal",
            value: "Type",
            raw: '"Type"',
            type: "string",
            location: INTERNAL_LOCATION,
            resolvedType: stringType,
          },
          location: INTERNAL_LOCATION,
        },
      ],
      location: INTERNAL_LOCATION,
    },
    location: INTERNAL_LOCATION,
  };

  // toString method
  const toStringMethod: AST.FunctionDecl = {
    kind: "FunctionDecl",
    isFrame: true,
    isStatic: false,
    name: "toString",
    attributes: [],
    genericParams: [],
    params: [
      {
        kind: "Parameter",
        name: "this",
        type: typeType,
        location: INTERNAL_LOCATION,
      },
    ],
    returnType: stringType,
    resolvedType: {
      kind: "FunctionType",
      returnType: stringType,
      paramTypes: [typeType],
      location: INTERNAL_LOCATION,
    },
    body: {
      kind: "Block",
      statements: [
        {
          kind: "Return",
          value: {
            kind: "Call",
            callee: {
              kind: "Member",
              object: {
                kind: "Identifier",
                name: "this",
                location: INTERNAL_LOCATION,
                resolvedType: typeType,
              },
              property: "getTypeName",
              location: INTERNAL_LOCATION,
              resolvedType: {
                kind: "FunctionType",
                returnType: stringType,
                paramTypes: [typeType],
                location: INTERNAL_LOCATION,
              },
            },
            args: [],
            genericArgs: [],
            location: INTERNAL_LOCATION,
            resolvedType: stringType,
            resolvedDeclaration: getTypeNameMethod,
          },
          location: INTERNAL_LOCATION,
        },
      ],
      location: INTERNAL_LOCATION,
    },
    location: INTERNAL_LOCATION,
  };

  // destroy method
  const destroyMethod: AST.FunctionDecl = {
    kind: "FunctionDecl",
    isFrame: true,
    isStatic: false,
    name: "destroy",
    attributes: [],
    genericParams: [],
    params: [
      {
        kind: "Parameter",
        name: "this",
        type: typeType,
        location: INTERNAL_LOCATION,
      },
    ],
    returnType: voidType,
    resolvedType: {
      kind: "FunctionType",
      returnType: voidType,
      paramTypes: [typeType],
      location: INTERNAL_LOCATION,
    },
    body: {
      kind: "Block",
      statements: [],
      location: INTERNAL_LOCATION,
    },
    location: INTERNAL_LOCATION,
  };

  return {
    kind: "StructDecl",
    name: "Type",
    genericParams: [],
    inheritanceList: [],
    members: [getTypeNameMethod, toStringMethod, destroyMethod],
    location: INTERNAL_LOCATION,
  };
}

export function createIntStructDecl(): AST.StructDecl {
  return {
    kind: "StructDecl",
    name: "Int",
    genericParams: [],
    inheritanceList: [],
    members: [
      {
        kind: "StructField",
        name: "value",
        type: createBasicType("i32"),
        location: INTERNAL_LOCATION,
      },
    ],
    location: INTERNAL_LOCATION,
  };
}

export function createLongStructDecl(): AST.StructDecl {
  return {
    kind: "StructDecl",
    name: "Long",
    genericParams: [],
    inheritanceList: [],
    members: [
      {
        kind: "StructField",
        name: "value",
        type: createBasicType("i64"),
        location: INTERNAL_LOCATION,
      },
    ],
    location: INTERNAL_LOCATION,
  };
}

export function createBoolStructDecl(): AST.StructDecl {
  return {
    kind: "StructDecl",
    name: "Bool",
    genericParams: [],
    inheritanceList: [],
    members: [
      {
        kind: "StructField",
        name: "value",
        type: createBasicType("i1"),
        location: INTERNAL_LOCATION,
      },
    ],
    location: INTERNAL_LOCATION,
  };
}

export function createDoubleStructDecl(): AST.StructDecl {
  return {
    kind: "StructDecl",
    name: "Double",
    genericParams: [],
    inheritanceList: [],
    members: [
      {
        kind: "StructField",
        name: "value",
        type: createBasicType("double"),
        location: INTERNAL_LOCATION,
      },
    ],
    location: INTERNAL_LOCATION,
  };
}

export function createStringStructDecl(): AST.StructDecl {
  return {
    kind: "StructDecl",
    name: "String",
    genericParams: [],
    inheritanceList: [],
    members: [
      {
        kind: "StructField",
        name: "data",
        type: createBasicType("i8", { pointerDepth: 1 }),
        location: INTERNAL_LOCATION,
      },
      {
        kind: "StructField",
        name: "length",
        type: createBasicType("i32"),
        location: INTERNAL_LOCATION,
      },
    ],
    location: INTERNAL_LOCATION,
  };
}

export function createIndexOutOfBoundsErrorDecl(): AST.StructDecl {
  return {
    kind: "StructDecl",
    name: "IndexOutOfBoundsError",
    genericParams: [],
    inheritanceList: [],
    members: [
      {
        kind: "StructField",
        name: "_vtable",
        type: createBasicType("i8", { pointerDepth: 1 }),
        location: INTERNAL_LOCATION,
      },
      {
        kind: "StructField",
        name: "message",
        type: createBasicType("String"),
        location: INTERNAL_LOCATION,
      },
      {
        kind: "StructField",
        name: "code",
        type: createBasicType("i32"),
        location: INTERNAL_LOCATION,
      },
      {
        kind: "StructField",
        name: "stack_frames",
        type: createBasicType("i8", { pointerDepth: 2 }),
        location: INTERNAL_LOCATION,
      },
      {
        kind: "StructField",
        name: "stack_depth",
        type: createBasicType("i32"),
        location: INTERNAL_LOCATION,
      },
      {
        kind: "StructField",
        name: "index",
        type: createBasicType("i32"),
        location: INTERNAL_LOCATION,
      },
      {
        kind: "StructField",
        name: "size",
        type: createBasicType("i32"),
        location: INTERNAL_LOCATION,
      },
    ],
    location: INTERNAL_LOCATION,
  };
}

const INDEX_OUT_OF_BOUNDS_ERROR_DECL = createIndexOutOfBoundsErrorDecl();

export function createDivisionByZeroErrorDecl(): AST.StructDecl {
  return {
    kind: "StructDecl",
    name: "DivisionByZeroError",
    genericParams: [],
    inheritanceList: [],
    members: [
      {
        kind: "StructField",
        name: "_vtable",
        type: createBasicType("i8", { pointerDepth: 1 }),
        location: INTERNAL_LOCATION,
      },
      {
        kind: "StructField",
        name: "message",
        type: createBasicType("String"),
        location: INTERNAL_LOCATION,
      },
      {
        kind: "StructField",
        name: "code",
        type: createBasicType("i32"),
        location: INTERNAL_LOCATION,
      },
      {
        kind: "StructField",
        name: "stack_frames",
        type: createBasicType("i8", { pointerDepth: 2 }),
        location: INTERNAL_LOCATION,
      },
      {
        kind: "StructField",
        name: "stack_depth",
        type: createBasicType("i32"),
        location: INTERNAL_LOCATION,
      },
    ],
    location: INTERNAL_LOCATION,
  };
}

/**
 * Initialize all builtin types in a symbol table scope
 */
export function initializeBuiltinsInScope(scope: SymbolTable): void {
  // Register base types
  for (let index = 0; index < BASE_TYPES.length; index++) {
    const name = BASE_TYPES[index]!;
    const type = createBasicType(name);
    scope.define({
      name,
      kind: "TypeAlias",
      type,
      declaration: {
        kind: "TypeAlias",
        location: INTERNAL_LOCATION,
        name,
        type,
      } as any,
    });
  }

  // Register type aliases
  for (let index = 0; index < TYPE_ALIASES.length; index++) {
    const aliasEntry = TYPE_ALIASES[index]!;
    const alias = aliasEntry[0];
    const target = aliasEntry[1];
    const type = createBasicType(target);
    scope.define({
      name: alias,
      kind: "TypeAlias",
      type,
      declaration: {
        kind: "TypeAlias",
        location: INTERNAL_LOCATION,
        name: alias,
        type,
      } as any,
    });
  }

  // Register string type (i8*)
  const stringType = createBasicType("i8", { pointerDepth: 1 });
  scope.define({
    name: "string",
    kind: "TypeAlias",
    type: stringType,
    declaration: {
      kind: "TypeAlias",
      location: INTERNAL_LOCATION,
      name: "string",
      type: stringType,
    } as any,
  });

  // Register NullAccessError struct type
  const nullAccessErrorDecl = createNullAccessErrorDecl();
  scope.define({
    name: "NullAccessError",
    kind: "Struct",
    type: createBasicType("NullAccessError"),
    declaration: nullAccessErrorDecl,
  });

  // Register IndexOutOfBoundsError struct type
  scope.define({
    name: "IndexOutOfBoundsError",
    kind: "Struct",
    type: createBasicType("IndexOutOfBoundsError"),
    declaration: INDEX_OUT_OF_BOUNDS_ERROR_DECL,
  });

  // Register DivisionByZeroError struct type
  const divisionByZeroErrorDecl = createDivisionByZeroErrorDecl();
  scope.define({
    name: "DivisionByZeroError",
    kind: "Struct",
    type: createBasicType("DivisionByZeroError"),
    declaration: divisionByZeroErrorDecl,
  });

  // Register Type struct (Root of type hierarchy)
  const typeDecl = createTypeStructDecl();
  scope.define({
    name: "Type",
    kind: "Struct",
    type: createBasicType("Type"),
    declaration: typeDecl,
  });

  // Register Long struct
  const longDecl = createLongStructDecl();
  scope.define({
    name: "Long",
    kind: "Struct",
    type: createBasicType("Long"),
    declaration: longDecl,
  });
}
