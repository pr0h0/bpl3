import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { Formatter } from "../compiler/formatter/Formatter";
import { formatterSemantics } from "./helpers/formatterSemantics";
import type { FormatterOptions } from "../compiler/formatter/FormatterOptions";

const sources = [
  "enum Choice:Marker, # second\n Other{A,B}",
  "struct Pair:Base, # second\n Other{x:int,y:int,}",
  "spec Pair:Base, # second\n Other{frame get()ret int;}",
  "struct Pair<T, # type\n U>{x:T,y:U,}",
  "enum Choice:Marker # brace\n {A,B}",
  "struct Pair:Base /# { not a brace #/ , # second\n Other{x:int,y:int,}",
];
const profiles: FormatterOptions[] = [
  {},
  { indentWidth: 2 },
  { useTabs: true },
  { lineEnding: "crlf" },
];
for (const [index, source] of sources.entries())
  for (const [profileIndex, options] of profiles.entries()) {
    test(`declaration header comments retain body spacing ${index}/${profileIndex}`, () => {
      const before = new Parser(source, "header-comments.bpl").parse();
      const output = new Formatter(options).format(before);
      const after = new Parser(output, "header-comments.bpl").parse();
      expect(formatterSemantics(after)).toEqual(formatterSemantics(before));
      expect(after.comments?.map((comment) => comment.lexeme)).toEqual(
        before.comments?.map((comment) => comment.lexeme),
      );
      expect(new Formatter(options).format(after)).toBe(output);
      expect(output).not.toMatch(/\{\r?\n\r?\n/);
    });
  }

test("declaration body spacing preserves a deliberate blank after the brace", () => {
  const source = "struct Pair:Base, # second\nOther{\n\nx:int,\n}";
  const formatter = new Formatter();
  const output = formatter.format(
    new Parser(source, "header-blank.bpl").parse(),
  );
  expect(output).toContain("Other {\n\n    x: int,");
  expect(formatter.format(new Parser(output, "header-blank.bpl").parse())).toBe(
    output,
  );
});

test("reused formatter resets header token provenance between source files", () => {
  const formatter = new Formatter();
  for (const source of sources) {
    const output = formatter.format(
      new Parser(source, "header-reuse.bpl").parse(),
    );
    expect(
      formatter.format(new Parser(output, "header-reuse.bpl").parse()),
    ).toBe(output);
  }
});
