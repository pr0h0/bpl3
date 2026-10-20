import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";
import { TokenType } from "../compiler/frontend/TokenType";

const cases = [
  { raw: String.raw`\x1g`, value: String.raw`\x1g` },
  { raw: String.raw`\xg1`, value: String.raw`\xg1` },
  { raw: String.raw`\u12g4`, value: String.raw`\u12g4` },
  { raw: String.raw`\u0x41`, value: String.raw`\u0x41` },
  { raw: String.raw`\u1zzz`, value: String.raw`\u1zzz` },
  { raw: String.raw`\x1\n`, value: "\\x1\n" },
  { raw: String.raw`\x1`, value: String.raw`\x1` },
  { raw: String.raw`\u12`, value: String.raw`\u12` },
  { raw: String.raw`\x41\u0042`, value: "AB" },
  { raw: String.raw`\q`, value: String.raw`\q` },
];
for (const fixture of cases)
  for (const mode of ["lexer", "parser"]) {
    // spec: R-LEX-8
    test(`${mode} consumes only complete hex escapes: ${fixture.raw}`, () => {
      const literal = '"' + fixture.raw + '"';
      if (mode === "lexer") {
        const token = lexWithGrammar(literal, "escape-bounds.bpl")[0];
        expect(token?.type).toBe(TokenType.StringLiteral);
        expect(token?.literal).toBe(fixture.value);
      } else {
        const program = new Parser(
          `frame main(){local value:string=${literal};}`,
          "escape-bounds.bpl",
        ).parse();
        const fn = program.statements[0];
        if (fn?.kind !== "FunctionDecl") throw new Error("Expected function");
        const variable = fn.body.statements[0];
        if (
          variable?.kind !== "VariableDecl" ||
          variable.initializer?.kind !== "Literal"
        )
          throw new Error("Expected literal binding");
        expect(variable.initializer.value).toBe(fixture.value);
      }
    });
  }

// spec: R-LEX-8
test("complete and malformed quoted escapes retain native values at O0 and O3", () => {
  const source = String.raw`import [printf] from "std/c.bpl";
frame main() ret int {
    printf("%s|%s|%s\n", "\x1g", "\u12g4", "\x414");
    return 0;
}`;
  expectCorrectnessSuite([
    {
      name: "quoted-hex-escape-bounds",
      source,
      expectedStdout: "\\x1g|\\u12g4|A4\n",
    },
  ]);
}, 30000);
