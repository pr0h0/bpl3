import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

const invalid = [
  String.raw`'\nABC'`,
  String.raw`'\tAB'`,
  String.raw`'\0z'`,
  String.raw`'\qtail'`,
  String.raw`'\\x'`,
  String.raw`'\x41'`,
  String.raw`'\u0041'`,
  "'ab'",
];
for (const raw of invalid) {
  // spec: R-LEX-9
  test(`character literal rejects discarded suffix: ${raw}`, () => {
    expect(() =>
      new Parser(
        `frame main(){local value:char=${raw};}`,
        "char-bounds.bpl",
      ).parse(),
    ).toThrow("Character literal must contain exactly one character");
  });
}

const valid = [
  ["'a'", "a"],
  [String.raw`'\n'`, "\n"],
  [String.raw`'\t'`, "\t"],
  [String.raw`'\r'`, "\r"],
  [String.raw`'\0'`, "\0"],
  [String.raw`'\\'`, "\\"],
  [String.raw`'\''`, "'"],
  [String.raw`'\"'`, '"'],
  [String.raw`'\q'`, "q"],
] as const;
for (const [raw, value] of valid) {
  // spec: R-LEX-9
  test(`single character decoding is unchanged: ${raw}`, () => {
    const program = new Parser(
      `frame main(){local value:char=${raw};}`,
      "char-bounds.bpl",
    ).parse();
    const fn = program.statements[0];
    if (fn?.kind !== "FunctionDecl") throw new Error("Expected function");
    const variable = fn.body.statements[0];
    if (variable?.kind !== "VariableDecl") throw new Error("Expected binding");
    expect(variable.initializer).toMatchObject({ kind: "Literal", value });
  });
}

// spec: R-LEX-9
test("valid escaped character literals retain native values at O0 and O3", () => {
  expectCorrectnessSuite([
    {
      name: "character-escape-bounds",
      source: String.raw`import [printf] from "std/c.bpl";
frame main() ret int {
    printf("%d %d %d %d %d\n", cast<int>('\n'), cast<int>('\t'), cast<int>('\0'), cast<int>('\\'), cast<int>('\''));
    return 0;
}`,
      expectedStdout: "10 9 0 92 39\n",
    },
  ]);
}, 30000);
