import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { Formatter } from "../compiler/formatter/Formatter";
import { formatterSemantics } from "./helpers/formatterSemantics";
import type { FormatterOptions } from "../compiler/formatter/FormatterOptions";

for (const tail of ["", "1&2==3;"]) {
  for (const newline of ["\n", "\r\n", "\r"]) {
    for (const options of [
      {},
      { useTabs: true },
      { indentWidth: 2, lineEnding: "crlf" },
    ] satisfies FormatterOptions[]) {
      test(`large repeated parenthesis normalization preserves comments ${JSON.stringify(tail)} ${JSON.stringify(newline)} ${JSON.stringify(options)}`, () => {
        const source = [
          "frame main(){",
          "# heading",
          ...Array.from(
            { length: 600 },
            (_, index) => `if((/# condition ${index} #/ true)){}${tail}`,
          ),
          "}",
        ].join(newline);
        const before = new Parser(source, "repeated-comments.bpl").parse();
        const formatter = new Formatter(options);
        const output = formatter.format(before);
        const after = new Parser(output, "repeated-comments.bpl").parse();
        expect(formatterSemantics(after)).toEqual(formatterSemantics(before));
        expect(after.comments?.map((comment) => comment.lexeme)).toEqual(
          before.comments?.map((comment) => comment.lexeme),
        );
        expect(
          [...output.matchAll(/if \(\s*\/\# condition (\d+) \#\/ true\)/g)].map(
            (match) => Number(match[1]),
          ),
        ).toEqual(Array.from({ length: 600 }, (_, index) => index));
        expect(formatter.format(after)).toBe(output);
      });
    }
  }
}

test("large normalization does not accept changed source content", () => {
  const source =
    "frame main(){\n# heading\n" + "if((true)){}\n".repeat(600) + "}";
  const ast = new Parser(source, "changed-repeated.bpl").parse();
  expect(() =>
    new Formatter().format(ast, source.replaceAll("true", "false")),
  ).toThrow();
});
