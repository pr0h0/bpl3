/**
 * String literal values are JavaScript strings, which cannot hold a byte
 * that is not valid UTF-8. A `\xHH` escape of 0x80 or above is therefore
 * stored as the lone low surrogate U+DC00 + HH, and emitted as that one byte.
 * Lone surrogates cannot come from anywhere else: source text is decoded
 * UTF-8, and the decoders turn an unpaired `\uHHHH` surrogate into U+FFFD.
 * grammar/bpl.peggy repeats this mapping because the generated parser has no
 * imports.
 */
const RAW_BYTE_BASE = 0xdc00;
const RAW_BYTE_FIRST = RAW_BYTE_BASE + 0x80;
const RAW_BYTE_LAST = RAW_BYTE_BASE + 0xff;

/** The string holding a byte written with a `\xHH` escape. */
export function rawByteToString(byte: number): string {
  return String.fromCharCode(byte < 0x80 ? byte : RAW_BYTE_BASE + byte);
}

/** The bytes of a decoded string literal, without its terminator. */
export function encodeStringLiteral(text: string): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let length = 0;
  let start = 0;
  const flush = (end: number) => {
    if (end > start) {
      const chunk = encoder.encode(text.slice(start, end));
      chunks.push(chunk);
      length += chunk.length;
    }
  };
  for (let index = 0; index < text.length; index++) {
    const unit = text.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      index++; // A pair is one code point, whatever its low half is.
      continue;
    }
    if (unit >= RAW_BYTE_FIRST && unit <= RAW_BYTE_LAST) {
      flush(index);
      chunks.push(Uint8Array.of(unit - RAW_BYTE_BASE));
      length += 1;
      start = index + 1;
    }
  }
  flush(text.length);
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
