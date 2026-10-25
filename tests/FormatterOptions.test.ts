import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { Formatter } from "../compiler/formatter/Formatter";
import type { FormatterOptions } from "../compiler/formatter/FormatterOptions";
import { formatterSemantics } from "./helpers/formatterSemantics";

const source = "frame main(){\nlocal values:int[2]=[1, # first\n2];\n}";
function format(options: FormatterOptions, text = source) {
  const program = new Parser(text, "options.bpl").parse();
  return new Formatter(options).format(program);
}

test("explicit BPL defaults equal the default formatter", () => {
  expect(format({ indentWidth: 4, useTabs: false, lineEnding: "lf" })).toBe(
    format({}),
  );
});

test("uses configured spaces for code, comments and list continuations", () => {
  const output = format({ indentWidth: 2 });
  expect(output).toBe(
    "frame main() {\n  local values: int[2] = [\n    1, # first\n    2\n  ];\n}\n",
  );
  expect(format({ indentWidth: 2 }, output)).toBe(output);
});

test("uses tabs for code, comments and list continuations", () => {
  const output = format({ useTabs: true, indentWidth: 4 });
  expect(output).toBe(
    "frame main() {\n\tlocal values: int[2] = [\n\t\t1, # first\n\t\t2\n\t];\n}\n",
  );
  expect(format({ useTabs: true }, output)).toBe(output);
});

test("uses CRLF for layout and comment newlines", () => {
  const output = format({ lineEnding: "crlf" });
  expect(output).not.toMatch(/(?<!\r)\n/);
  expect(output.endsWith("\r\n")).toBe(true);
  expect(format({ lineEnding: "crlf" }, output)).toBe(output);
});

test("keeps newline payloads inside comment-bearing interpolated literals", () => {
  const raw = "`first\r\n${1 /# inner #/ + 2} 😀`";
  const input = `frame main(){local text:String=${raw}; # outer\n}`;
  for (const options of [
    { lineEnding: "lf" as const },
    { lineEnding: "crlf" as const },
    { indentWidth: 2, useTabs: true },
  ]) {
    const output = format(options, input);
    expect(output).toContain(raw);
    expect(
      formatterSemantics(new Parser(output, "options.bpl").parse()),
    ).toEqual(formatterSemantics(new Parser(input, "options.bpl").parse()));
    expect(format(options, output)).toBe(output);
  }
});

for (const options of [
  null,
  [],
  true,
  { indentWidth: 0 },
  { indentWidth: 17 },
  { indentWidth: 1.5 },
  { indentWidth: "2" },
  { indentWidth: NaN },
  { useTabs: "yes" },
  { lineEnding: "cr" },
  { lineEnding: 1 },
  { tabWidth: 4 },
  { $schema: 42 },
]) {
  test(`rejects invalid options: ${JSON.stringify(options)}`, () => {
    expect(
      () => new Formatter(options as unknown as FormatterOptions),
    ).toThrow();
  });
}

test("accepts schema metadata and does not mutate supplied preferences", () => {
  const options = Object.freeze({ indentWidth: 2, $schema: "schema.json" });
  expect(format(options)).toBe(format({ indentWidth: 2 }));
  expect(options).toEqual({ indentWidth: 2, $schema: "schema.json" });
});
