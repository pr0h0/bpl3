import { expect, test } from "bun:test";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { TokenType } from "../compiler/frontend/TokenType";

const cases = [
  { source: "", line: 1, column: 1 },
  { source: "   ", line: 1, column: 4 },
  { source: "x  ", line: 1, column: 4 },
  { source: "x\n\t", line: 2, column: 2 },
  { source: "x\r\n  ", line: 2, column: 3 },
  { source: "x\r  ", line: 2, column: 3 },
  { source: "\r\n\r\n", line: 3, column: 1 },
  { source: "# note\r\r", line: 3, column: 1 },
  { source: "/# one\rtwo #/  ", line: 2, column: 9 },
  { source: "`one\ntwo`", line: 2, column: 5 },
  { source: "`one\rtwo`  ", line: 2, column: 7 },
  { source: '"😀"  ', line: 1, column: 7 },
];
for (const { source, line, column } of cases) {
  test(`EOF reports the true source end: ${JSON.stringify(source)}`, () => {
    const tokens = lexWithGrammar(source, "eof.bpl");
    expect(tokens.at(-1)).toMatchObject({
      type: TokenType.EOF,
      lexeme: "",
      line,
      column,
      file: "eof.bpl",
    });
    expect(tokens.filter((token) => token.type === TokenType.EOF)).toHaveLength(
      1,
    );
  });
}
