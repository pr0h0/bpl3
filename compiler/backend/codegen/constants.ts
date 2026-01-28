/**
 * Code Generation Constants
 *
 * Named constants for magic numbers used throughout the code generator.
 * Centralizing these values improves readability and maintainability.
 */

// =============================================================================
// Type Size Constants (in bits)
// =============================================================================

/** Size of a pointer in bits on 64-bit architectures */
export const POINTER_SIZE_BITS = 64;

/** Size of a pointer in bytes on 64-bit architectures */
export const POINTER_SIZE_BYTES = 8;

/** Size of a slice struct { ptr, len } in bits */
export const SLICE_SIZE_BITS = 128;

/** Size of a lambda/closure struct { func_ptr, env_ptr } in bits */
export const LAMBDA_SIZE_BITS = 128;

// =============================================================================
// DWARF Debug Info Encoding Constants
// =============================================================================
// These match the DWARF standard encoding values

/** DWARF encoding for boolean types */
export const DWARF_ATE_BOOLEAN = 2;

/** DWARF encoding for floating-point types */
export const DWARF_ATE_FLOAT = 4;

/** DWARF encoding for signed integer types */
export const DWARF_ATE_SIGNED = 5;

/** DWARF encoding for signed char types */
export const DWARF_ATE_SIGNED_CHAR = 6;

/** DWARF encoding for unsigned integer types */
export const DWARF_ATE_UNSIGNED = 7;

/** DWARF encoding for unsigned char types */
export const DWARF_ATE_UNSIGNED_CHAR = 8;

// =============================================================================
// Exception Handling Constants
// =============================================================================

/**
 * Size of jmp_buf in 64-bit words.
 * Platform dependent, [32 x i64] = 256 bytes is sufficient for x86_64.
 */
export const JMPBUF_SIZE_WORDS = 32;

/** Size of jmp_buf in bytes */
export const JMPBUF_SIZE_BYTES = JMPBUF_SIZE_WORDS * 8;

// =============================================================================
// Type Alignment Constants (in bits)
// =============================================================================

/** Default alignment for 8-bit types */
export const ALIGN_8 = 8;

/** Default alignment for 16-bit types */
export const ALIGN_16 = 16;

/** Default alignment for 32-bit types */
export const ALIGN_32 = 32;

/** Default alignment for 64-bit types */
export const ALIGN_64 = 64;

// =============================================================================
// Primitive Type Sizes (in bits)
// =============================================================================

/** Size of i8/u8/char types in bits */
export const SIZE_I8 = 8;

/** Size of i16/u16/short types in bits */
export const SIZE_I16 = 16;

/** Size of i32/u32/int types in bits */
export const SIZE_I32 = 32;

/** Size of i64/u64/long types in bits */
export const SIZE_I64 = 64;

/** Size of f32/float types in bits */
export const SIZE_F32 = 32;

/** Size of f64/double types in bits */
export const SIZE_F64 = 64;

/** Size of bool type in bits (stored as i8) */
export const SIZE_BOOL = 8;

// =============================================================================
// Hash Function Constants
// =============================================================================

/** FNV-1a 32-bit offset basis */
export const FNV1A_32_OFFSET_BASIS = 0x811c9dc5;

/** FNV-1a 32-bit prime */
export const FNV1A_32_PRIME = 0x01000193;

/** FNV-1a 64-bit offset basis */
export const FNV1A_64_OFFSET_BASIS = 0xcbf29ce484222325n;

/** FNV-1a 64-bit prime */
export const FNV1A_64_PRIME = 0x100000001b3n;

/** 64-bit mask for hash truncation */
export const HASH_64_MASK = 0xffffffffffffffffn;

// =============================================================================
// Miscellaneous Constants
// =============================================================================

/** Multiplier for location size calculation (prioritizes line over column) */
export const LOCATION_SIZE_LINE_MULTIPLIER = 10000;

/** Bytes per kilobyte (for formatting) */
export const BYTES_PER_KB = 1024;

/** Maximum buffer size for object file parsing (10 MB) */
export const MAX_OBJFILE_BUFFER_SIZE = 10 * 1024 * 1024;

// =============================================================================
// RTTI Type Kind Constants
// =============================================================================

/** RTTI type kind for primitive types */
export const TYPE_KIND_PRIMITIVE = 0;

/** RTTI type kind for struct types */
export const TYPE_KIND_STRUCT = 1;

/** RTTI type kind for array types */
export const TYPE_KIND_ARRAY = 2;

/** RTTI type kind for pointer types */
export const TYPE_KIND_POINTER = 3;

/** RTTI type kind for enum types */
export const TYPE_KIND_ENUM = 4;

/** RTTI type kind for function types */
export const TYPE_KIND_FUNCTION = 5;

/** RTTI type kind for tuple types */
export const TYPE_KIND_TUPLE = 6;

/** RTTI type kind for lambda types */
export const TYPE_KIND_LAMBDA = 7;
