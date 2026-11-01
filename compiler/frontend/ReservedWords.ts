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
// A reserved word where a declaration expects a name: a parameter after `(`
// or `,`, or a variable after `local`/`global` (and `const`).
const RESERVED_NAME = new RegExp(
  `(?:[(,]\\s*(?:const\\s+)?|\\b(?:local|global)\\s+(?:const\\s+)?)(${WORDS})(?=\\s*[:=])`,
);

/**
 * The reserved word, and its offset in `text`, used as a parameter or variable
 * name in `text`, or undefined.
 */
export function findReservedName(
  text: string,
): { word: string; offset: number } | undefined {
  const match = RESERVED_NAME.exec(text);
  if (!match) return undefined;
  return {
    word: match[1]!,
    offset: match.index + match[0].length - match[1]!.length,
  };
}
