/**
 * Source text with whitespace and trailing commas before a closing bracket
 * removed, so assertions about code shape do not depend on how Prettier
 * wraps a line.
 */
export function compact(text: string): string {
  return text.replace(/\s+/g, "").replace(/,([)\]}])/g, "$1");
}

/**
 * Prose with each run of whitespace collapsed to one space, and the spaces and
 * trailing commas just inside brackets removed, so documentation checks
 * tolerate Prettier rewrapping a code example while words and command
 * arguments stay separated.
 */
export function normalizeSpacing(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/([([{]) /g, "$1")
    .replace(/ ([)\]}])/g, "$1")
    .replace(/,([)\]}])/g, "$1");
}
