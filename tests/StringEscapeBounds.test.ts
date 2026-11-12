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
  // Bytes above 0x7F are held as U+DC00 + byte (common/StringEncoding.ts).
  { raw: String.raw`\xF0`, value: "\udcf0" },
  { raw: String.raw`\x7f\x80`, value: "\x7f\udc80" },
  // Unpaired surrogates cannot be mistaken for those bytes.
  { raw: String.raw`\udcf0`, value: "\ufffd" },
  { raw: String.raw`\ud83d`, value: "\ufffd" },
  { raw: String.raw`\ud83d\xF0`, value: "\ufffd\udcf0" },
  { raw: String.raw`\ud83d\ude00`, value: "\u{1f600}" },
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

// spec: R-LEX-8
test("\\xHH escapes are single raw bytes at O0 and O3", () => {
  expectCorrectnessSuite([
    {
      name: "raw-byte-escapes",
      validateLlvm: true,
      source: String.raw`extern printf(fmt: string, ...);
extern strlen(s: string) ret ulong;
extern strcmp(a: string, b: string) ret int;
global raw: string = "\xF0\x80";
frame dump(s: string) {
    local i: ulong = cast<ulong>(0);
    loop (i < strlen(s)) {
        printf("%02x ", cast<int>(cast<u8>(s[i])));
        i = i + cast<ulong>(1);
    }
    printf("|\n");
}
frame main() ret int {
    dump("\xF0");
    dump("\xC3\xA9");
    dump("\u00e9");
    dump("é");
    dump(raw);
    dump("a\xFFb€\xFEc${"\u{1f480}"}\x80");
    dump("\ud83d\xF0");
    dump("\udc80");
    printf("%d\n", strcmp("\xC3\xA9", "é"));
    printf("%d\n", cast<int>(strlen("\xF0") == cast<ulong>(1)));
    printf("%d %d\n", cast<int>('\xF0'), cast<int>('\x41'));
    switch ("\xC3") {
        case "\xC3": printf("switch\n"); break;
        default: printf("default\n"); break;
    }
    printf("%d\n", match ("\xF1") { "\xF0" => 0, "\xF1" => 1, _ => 2 });
    return 0;
}
`,
      expectedStdout: [
        "f0 |",
        "c3 a9 |",
        "c3 a9 |",
        "c3 a9 |",
        "f0 80 |",
        "61 ff 62 e2 82 ac fe 63 f0 9f 92 80 80 |",
        "ef bf bd f0 |",
        "ef bf bd |",
        "0",
        "1",
        "-16 65",
        "switch",
        "1",
        "",
      ].join("\n"),
    },
  ]);
});
