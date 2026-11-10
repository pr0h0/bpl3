/**
 * Words the grammar never accepts as identifiers (`KeywordReserved` in
 * grammar/bpl.peggy, R-LEX-3). tests/ReservedNameDiagnostics.test.ts keeps the
 * two lists equal.
 */
export const RESERVED_WORDS: readonly string[] = [
  "global",
  "local",
  "const",
  "type",
  "frame",
  "static",
  "ret",
  "struct",
  "enum",
  "spec",
  "Self",
  "import",
  "from",
  "as",
  "export",
  "extern",
  "asm",
  "loop",
  "if",
  "else",
  "break",
  "continue",
  "try",
  "catch",
  "return",
  "throw",
  "switch",
  "case",
  "default",
  "fallthrough",
  "cast",
  "sizeof",
  "typeof",
  "offsetof",
  "match",
  "is",
  "Func",
  "Lambda",
  "null",
  "nullptr",
  "true",
  "false",
];

const WORDS = RESERVED_WORDS.join("|");
// A reserved word where a declaration expects a name, followed by `:` or a
// single `=`: a parameter after `(` or `,` (and a struct field after `,`), a
// lambda parameter after `|`, a struct field or struct-literal field after
// `{` (but not a switch's `default:` or `case`), or a variable after
// `local`/`global` (optionally `const`). `==` is a comparison, not a name.
const RESERVED_NAME = new RegExp(
  `(?:[(,|]\\s*(?:const\\s+)?|\\{\\s*(?!(?:default|case)\\b)|\\b(?:local|global)\\s+(?:const\\s+)?)(${WORDS})(?=\\s*(?::|=(?!=)))`,
);

// A reserved word naming a declaration: `frame ret(...)`, `struct if {`.
const RESERVED_DECLARATION_NAME = new RegExp(
  `\\b(?:frame|struct|spec|enum|type)\\s+(${WORDS})(?=\\s*[<({=:])`,
);
// A variable declared without a type: `local x;`, `global B = 1;`.
const UNTYPED_VARIABLE =
  /\b(?:local|global)\s+(?:const\s+)?([A-Za-z_]\w*)(?=\s*(?:;|=(?!=)))/;
const ENUM_DECLARATION = /^\s*(?:export\s+)?enum\b/;
const RESERVED_VARIANT = new RegExp(`[{,]\\s*(${WORDS})(?=\\s*[,({}])`);

/**
 * `text` with the contents of string and character literals and comments
 * replaced by spaces, so their words are not mistaken for names. Offsets are
 * unchanged.
 */
function maskLiteralsAndComments(text: string): string {
  const chars = [...text];
  let i = 0;
  const blank = (from: number, to: number) => {
    for (let k = from; k < to && k < chars.length; k++) {
      if (chars[k] !== "\n" && chars[k] !== "\r") chars[k] = " ";
    }
  };
  while (i < chars.length) {
    const c = chars[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < chars.length && chars[j] !== c) {
        if (chars[j] === "\\") j++;
        j++;
      }
      blank(i + 1, j);
      i = j + 1;
    } else if (c === "/" && chars[i + 1] === "#") {
      const close = text.indexOf("#/", i + 2);
      const end = close < 0 ? chars.length : close + 2;
      blank(i, end);
      i = end;
    } else if (c === "#") {
      let j = i;
      while (j < chars.length && chars[j] !== "\n" && chars[j] !== "\r") j++;
      blank(i, j);
      i = j;
    } else {
      i++;
    }
  }
  return chars.join("");
}

/**
 * The reserved word, and its offset in `text`, used as a parameter, field or
 * variable name in `text`, or undefined.
 */
export function findReservedName(
  text: string,
): { word: string; offset: number } | undefined {
  const masked = maskLiteralsAndComments(text);
  // An enum body holds only variants, so there a word after `{` or `,` that
  // is followed by `,`, `(`, `{` or `}` is a variant name, not a statement.
  const match =
    RESERVED_NAME.exec(masked) ??
    RESERVED_DECLARATION_NAME.exec(masked) ??
    (ENUM_DECLARATION.test(masked) ? RESERVED_VARIANT.exec(masked) : null);
  if (!match) return undefined;
  return {
    word: match[1]!,
    offset: match.index + match[0].length - match[1]!.length,
  };
}

/**
 * The name, and its offset in `text`, of a variable declared without a type
 * annotation in `text` (`local x;`), or undefined.
 */
export function findUntypedVariable(
  text: string,
): { name: string; offset: number } | undefined {
  const masked = maskLiteralsAndComments(text);
  const match = UNTYPED_VARIABLE.exec(masked);
  if (!match || RESERVED_WORDS.includes(match[1]!)) return undefined;
  return {
    name: match[1]!,
    offset: match.index + match[0].length - match[1]!.length,
  };
}
