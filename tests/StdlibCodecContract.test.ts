import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

// Base64.isValid and Hex.isValid used to answer for a grammar their own
// decoders did not implement: "QUJ", "QQ=" and "Q" were all called valid and
// then decoded to nothing, and "abc" was called valid hex while the decoder
// dropped the unpaired digit. Both now run one scan, so a string is valid
// exactly when it decodes, and every case below was checked against Python's
// base64.b64decode(validate=True) and bytes.fromhex.
const accepted: [string, number][] = [
  // [input, decoded byte count]
  ["", 0],
  ["QUJD", 3],
  ["QQ==", 1],
  ["QUJDRA==", 4],
  ["QUJDRUY=", 5],
  // Whitespace is ignored wherever it falls.
  [" QUJD ", 3],
  ["QU JD", 3],
  ["QU\\nJD", 3],
  ["QQ== ", 1],
  // Both alphabets decode, standard and URL-safe.
  ["++//", 3],
  ["-_-_", 3],
];

const rejected = [
  // Partial groups: the old predicate accepted all three.
  "Q",
  "QU",
  "QUJ",
  "QQ=",
  "QUJDQ",
  // Padding out of place.
  "====",
  "=QQQ",
  "QQ=A",
  "A===",
  "QU==JD",
  // Data after the padded final group.
  "QQ==QQ==",
  "QUJD=",
  // Characters outside the alphabet.
  "QU!JD",
  "QU.JD",
];

const hexAccepted: [string, number][] = [
  ["", 0],
  ["4142", 2],
  ["41", 1],
  ["ABCDEF", 3],
  ["abcdef", 3],
  // Whitespace separates pairs, as it does for bytes.fromhex.
  ["41 42", 2],
  ["41\\n42", 2],
  ["4142  ", 2],
  [" 4142", 2],
  // A 0x prefix is accepted here even though Python refuses it.
  ["0x4142", 2],
  ["0X41", 1],
  ["0x", 0],
];

const hexRejected = [
  // Odd digit counts: "414" and "abc" were called valid before.
  "4",
  "414",
  "abc",
  "4142 4",
  // Whitespace may not split a pair.
  "4 142",
  "41 4 2",
  // Characters outside the alphabet, in either position.
  "41ZZ42",
  "Z1",
  "1Z",
  "41g2",
];

const checks: string[] = [];
let n = 0;
for (const [input, length] of accepted) {
  checks.push(`
    # ${JSON.stringify(input)} decodes to ${length} bytes.
    if (!Base64.isValid("${input}")) { return ${++n}; }
    if (Base64.decodedLength("${input}") != ${length}) { return ${++n}; }
    if (Base64.decode("${input}", scratch) != ${length}) { return ${++n}; }
    if (Base64.decodeToString("${input}") == nullptr) { return ${++n}; }`);
}
for (const input of rejected) {
  checks.push(`
    if (Base64.isValid("${input}")) { return ${++n}; }
    if (Base64.decodedLength("${input}") != -1) { return ${++n}; }
    if (Base64.decode("${input}", scratch) != -1) { return ${++n}; }
    if (Base64.decodeToString("${input}") != nullptr) { return ${++n}; }`);
}
for (const [input, length] of hexAccepted) {
  checks.push(`
    if (!Hex.isValid("${input}")) { return ${++n}; }
    if (Hex.decodedLength("${input}") != ${length}) { return ${++n}; }
    if (Hex.decode("${input}", scratch) != ${length}) { return ${++n}; }
    if (Hex.decodeToString("${input}") == nullptr) { return ${++n}; }`);
}
for (const input of hexRejected) {
  checks.push(`
    if (Hex.isValid("${input}")) { return ${++n}; }
    if (Hex.decodedLength("${input}") != -1) { return ${++n}; }
    if (Hex.decode("${input}", scratch) != -1) { return ${++n}; }
    if (Hex.decodeToString("${input}") != nullptr) { return ${++n}; }`);
}

test("a codec accepts exactly the strings it can decode", () => {
  expectCorrectnessSuite([
    {
      name: "codec-contract",
      validateLlvm: true,
      source: `
      import [Base64] from "std/base64.bpl";
      import [Hex] from "std/hex.bpl";
      import printf, malloc from "std/c.bpl";

      frame main() ret int {
        local scratch: *u8 = cast<*u8>(malloc(cast<long>(64)));
        ${checks.join("\n")}

        # A null output is refused rather than reported as an empty decode,
        # so a caller cannot mistake it for success.
        if (Base64.decode("QUJD", nullptr) != -1) { return 900; }
        if (Hex.decode("4142", nullptr) != -1) { return 901; }
        if (Base64.decodedLength(nullptr) != -1) { return 902; }
        if (Hex.decodedLength(nullptr) != -1) { return 903; }
        if (Base64.isValid(nullptr)) { return 904; }
        if (Hex.isValid(nullptr)) { return 905; }

        printf("contract ok\\n");
        return 0;
      }`,
      expectedStdout: "contract ok\n",
    },
  ]);
}, 120000);

// Every length exercises a different padding shape, and the byte values walk
// the whole range so a mis-shifted nibble shows up.
test("encoding and decoding round-trip at every length", () => {
  expectCorrectnessSuite([
    {
      name: "codec-roundtrip",
      validateLlvm: true,
      source: `
      import [Base64] from "std/base64.bpl";
      import [Hex] from "std/hex.bpl";
      import printf, malloc from "std/c.bpl";

      frame main() ret int {
        local source: *u8 = cast<*u8>(malloc(cast<long>(64)));
        loop (local i: int = 0; i < 64; i = i + 1) {
          # 1..255, skipping the terminator so the bytes can also be read
          # back as a string.
          *(source + i) = cast<u8>(((i * 37) % 255) + 1);
        }

        local back: *u8 = cast<*u8>(malloc(cast<long>(64)));
        local failures: int = 0;

        loop (local n: int = 0; n <= 48; n = n + 1) {
          local encoded: string = Base64.encode(source, n);
          if (!Base64.isValid(encoded)) { failures = failures + 1; }
          if (Base64.decodedLength(encoded) != n) { failures = failures + 1; }
          if (Base64.decode(encoded, back) != n) { failures = failures + 1; }
          loop (local b: int = 0; b < n; b = b + 1) {
            if (*(back + b) != *(source + b)) { failures = failures + 1; }
          }

          local hexed: string = Hex.encode(source, n);
          if (!Hex.isValid(hexed)) { failures = failures + 1; }
          if (Hex.decodedLength(hexed) != n) { failures = failures + 1; }
          if (Hex.decode(hexed, back) != n) { failures = failures + 1; }
          loop (local c: int = 0; c < n; c = c + 1) {
            if (*(back + c) != *(source + c)) { failures = failures + 1; }
          }

          local upper: string = Hex.encodeUpper(source, n);
          if (!Hex.isValid(upper)) { failures = failures + 1; }
          if (Hex.decode(upper, back) != n) { failures = failures + 1; }
          loop (local d: int = 0; d < n; d = d + 1) {
            if (*(back + d) != *(source + d)) { failures = failures + 1; }
          }
        }

        printf("%d\\n", failures);
        return 0;
      }`,
      expectedStdout: "0\n",
    },
  ]);
}, 120000);
