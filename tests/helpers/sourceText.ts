/**
 * Source text with whitespace removed next to punctuation and trailing commas
 * before a closing bracket dropped, so assertions about code shape do not
 * depend on how Prettier wraps a line. Whitespace between two word
 * characters stays as one space, so `bun run x` does not match `bunrun x`.
 */
export function compact(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/(?<![\w$]) | (?![\w$])/g, "")
    .replace(/,([)\]}])/g, "$1");
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
