export function hashString(str: string): string {
  // Use Bun's fast hash if available
  if (typeof (globalThis as any).Bun !== "undefined") {
    return (globalThis as any).Bun.hash(str).toString(16);
  }

  // Fallback implementation (FNV-1a 32-bit) for Node.js / VS Code environment
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}
