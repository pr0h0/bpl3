import type AsmGenerator from "./AsmGenerator";
import type Scope from "./Scope";

export default class HelperGenerator {
  // #region Base Types
  static generateBaseTypes(gen: AsmGenerator, scope: Scope): void {
    scope.defineType("u8", {
      size: 1,
      alignment: 1,
      isArray: [],
      isPointer: 0,
      isPrimitive: true,
      name: "u8",
      info: {
        description: "Unsigned 8-bit integer",
        signed: false,
        range: [0, 255],
      },
      members: new Map(),
    });

    scope.defineType("u16", {
      size: 2,
      alignment: 2,
      isArray: [],
      isPointer: 0,
      isPrimitive: true,
      name: "u16",
      info: {
        description: "Unsigned 16-bit integer",
        signed: false,
        range: [0, 65535],
      },
      members: new Map(),
    });

    scope.defineType("u32", {
      size: 4,
      alignment: 4,
      isArray: [],
      isPointer: 0,
      isPrimitive: true,
      name: "u32",
      info: {
        description: "Unsigned 32-bit integer",
        signed: false,
        range: [0, 4294967295],
      },
      members: new Map(),
    });

    scope.defineType("u64", {
      size: 8,
      alignment: 8,
      isArray: [],
      isPointer: 0,
      isPrimitive: true,
      name: "u64",
      info: {
        description: "Unsigned 64-bit integer",
        signed: false,
        range: [0, 18446744073709551615],
      },
      members: new Map(),
    });

    scope.defineType("i8", {
      size: 1,
      alignment: 1,
      isArray: [],
      isPointer: 0,
      isPrimitive: true,
      name: "i8",
      info: {
        description: "Signed 8-bit integer",
        signed: true,
        range: [-128, 127],
      },
      members: new Map(),
    });

    scope.defineType("i16", {
      size: 2,
      alignment: 2,
      isArray: [],
      isPointer: 0,
      isPrimitive: true,
      name: "i16",
      info: {
        description: "Signed 16-bit integer",
        signed: true,
        range: [-32768, 32767],
      },
      members: new Map(),
    });

    scope.defineType("i32", {
      size: 4,
      alignment: 4,
      isArray: [],
      isPointer: 0,
      isPrimitive: true,
      name: "i32",
      info: {
        description: "Signed 32-bit integer",
        signed: true,
        range: [-2147483648, 2147483647],
      },
      members: new Map(),
    });

    scope.defineType("i64", {
      size: 8,
      alignment: 8,
      isArray: [],
      isPointer: 0,
      isPrimitive: true,
      name: "i64",
      info: {
        description: "Signed 64-bit integer",
        signed: true,
        range: [-9223372036854775808, 9223372036854775807],
      },
      members: new Map(),
    });

    scope.defineType("f32", {
      size: 4,
      alignment: 4,
      isArray: [],
      isPointer: 0,
      isPrimitive: true,
      name: "f32",
      info: {
        description: "32-bit floating point number",
        signed: true,
      },
      members: new Map(),
    });

    scope.defineType("f64", {
      size: 8,
      alignment: 8,
      isArray: [],
      isPointer: 0,
      isPrimitive: true,
      name: "f64",
      info: {
        description: "64-bit floating point number",
        signed: true,
      },
      members: new Map(),
    });
  }
  // #endregion
}
