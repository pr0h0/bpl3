import { expect, test } from "bun:test";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { TokenType } from "../compiler/frontend/TokenType";

for (const literal of ['"😀"', '"😃#literal"', "`🌍 ${1}`"]) {
  for (const comment of ["", " # trailing\n"]) {
    test(`token columns after ${literal} match source offsets ${JSON.stringify(comment)}`, () => {
      const source = `frame main(){local text:string=${literal};${comment}}`;
      const token = lexWithGrammar(source, "unicode.bpl").find(
        (token) => token.type === TokenType.Semicolon,
      );
      expect(token?.line).toBe(1);
      expect(token?.column).toBe(source.indexOf(";") + 1);
    });
  }
}

test("token columns after multiline literals count UTF-16 units", () => {
  const source = "frame main(){local text:string=`first\n😀`; # trailing\n}";
  const token = lexWithGrammar(source, "unicode.bpl").find(
    (token) => token.type === TokenType.Semicolon,
  );
  expect(token?.line).toBe(2);
  expect(token?.column).toBe(4);
});
