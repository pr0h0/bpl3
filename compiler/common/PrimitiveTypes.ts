/** Shared scalar type contract for checking, conversion, and LLVM lowering. */
export interface PrimitiveTypeInfo {
  readonly canonicalName: string;
  readonly kind: "integer" | "float" | "boolean";
  readonly bits: number;
  readonly signed: boolean;
  readonly llvmType: string;
  readonly debugName: string;
  readonly debugEncoding: number;
}

const canonical: Record<string, PrimitiveTypeInfo> = {};
for (const bits of [8, 16, 32, 64]) {
  for (const signed of [true, false]) {
    const name = `${signed ? "i" : "u"}${bits}`;
    const label = (
      { 8: "char", 16: "short", 32: "int", 64: "long" } as Record<number, string>
    )[bits]!;
    canonical[name] = {
      canonicalName: name,
      kind: "integer",
      bits,
      signed,
      llvmType: `i${bits}`,
      debugName: signed ? (bits === 8 ? "signed char" : label) : `unsigned ${label}`,
      debugEncoding: bits === 8 ? (signed ? 6 : 8) : signed ? 5 : 7,
    };
  }
}
canonical.i1 = {
  canonicalName: "i1",
  kind: "boolean",
  bits: 1,
  signed: false,
  llvmType: "i1",
  debugName: "bool",
  debugEncoding: 2,
};
canonical.f32 = {
  canonicalName: "f32",
  kind: "float",
  bits: 32,
  signed: true,
  llvmType: "float",
  debugName: "float",
  debugEncoding: 4,
};
canonical.double = {
  canonicalName: "double",
  kind: "float",
  bits: 64,
  signed: true,
  llvmType: "double",
  debugName: "double",
  debugEncoding: 4,
};

export const PRIMITIVE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  int: "i32",
  uint: "u32",
  float: "double",
  f64: "double",
  bool: "i1",
  char: "i8",
  uchar: "u8",
  short: "i16",
  ushort: "u16",
  long: "i64",
  ulong: "u64",
});

const types: Record<string, PrimitiveTypeInfo> = { ...canonical };
for (const [alias, name] of Object.entries(PRIMITIVE_ALIASES)) {
  types[alias] = canonical[name]!;
}
// Preserve the public spelling in debug information where it differs.
types.char = { ...canonical.i8!, debugName: "char", debugEncoding: 8 };
types.float = { ...canonical.double!, debugName: "float" };
export const PRIMITIVE_TYPES: Readonly<Record<string, PrimitiveTypeInfo>> =
  Object.freeze(types);
export const PRIMITIVE_NAMES = Object.keys(PRIMITIVE_TYPES);
export const PRIMITIVE_INTEGER_NAMES = PRIMITIVE_NAMES.filter(
  (name) => PRIMITIVE_TYPES[name]!.kind === "integer",
);
export const PRIMITIVE_CANONICAL_NAMES = Object.keys(canonical);

export function getPrimitiveType(name: string): PrimitiveTypeInfo | undefined {
  return Object.hasOwn(PRIMITIVE_TYPES, name) ? PRIMITIVE_TYPES[name] : undefined;
}
