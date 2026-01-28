/** FNV-1a 32-bit offset basis */
const FNV1A_32_OFFSET_BASIS = 0x811c9dc5;

/** FNV-1a 32-bit prime */
const FNV1A_32_PRIME = 0x01000193;

/**
 * Compute a hash string from the input using FNV-1a algorithm.
 * Uses Bun's native hash if available for performance.
 */
export function hashString(str: string): string {
  // Use Bun's fast hash if available
  if (typeof (globalThis as any).Bun !== "undefined") {
    return (globalThis as any).Bun.hash(str).toString(16);
  }

  // Fallback implementation (FNV-1a 32-bit) for Node.js / VS Code environment
  let h = FNV1A_32_OFFSET_BASIS;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, FNV1A_32_PRIME);
  }
  return (h >>> 0).toString(16);
}
