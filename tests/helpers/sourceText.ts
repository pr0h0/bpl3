/**
 * Source text with whitespace and trailing commas before a closing bracket
 * removed, so assertions about code shape do not depend on how Prettier
 * wraps a line.
 */
export function compact(text: string): string {
  return text.replace(/\s+/g, "").replace(/,([)\]}])/g, "$1");
}
