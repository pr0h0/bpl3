/**
 * Utility for mangling struct method names to avoid collisions
 * with user-defined functions and to enable method resolution.
 */

/**
 * Mangle a method name for a struct type.
 * Format: __bplm__STRUCT__METHOD__
 * For generic types like "Vec<i64>", sanitizes to "Vec_i64_"
 */
export function mangleMethod(structName: string, methodName: string): string {
  // Sanitize struct name for generics and special chars
  const sanitized = structName.replace(/[<>,\s\*\[\]]/g, "_");
  return `__bplm__${sanitized}__${methodName}__`;
}

/**
 * Check if a function name is a mangled method name
 */
export function isMethodMangledName(name: string): boolean {
  return name.startsWith("__bplm__");
}

/**
 * Extract struct and method name from mangled name
 * Returns null if not a valid mangled method name
 */
export function demangleMethod(
  mangledName: string,
): { structName: string; methodName: string } | null {
  if (!isMethodMangledName(mangledName)) return null;

  const pattern = /^__bplm__(.+)__(.+)__$/;
  const match = mangledName.match(pattern);

  if (!match) return null;

  return {
    structName: match[1]!,
    methodName: match[2]!,
  };
}
