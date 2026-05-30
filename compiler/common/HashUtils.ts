/** FNV-1a 32-bit offset basis */
const FNV1A_32_OFFSET_BASIS = 0x811c9dc5;

/** FNV-1a 32-bit prime */
const FNV1A_32_PRIME = 0x01000193;

/**
 * Compute a stable hash string from the input using FNV-1a.
 *
 * This intentionally avoids runtime-native hash functions so generated symbol
 * suffixes stay identical under Bun, Node, the CLI, and the VS Code extension.
 */
export function hashString(str: string): string {
  let h = FNV1A_32_OFFSET_BASIS;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, FNV1A_32_PRIME);
  }
  return (h >>> 0).toString(16);
}
