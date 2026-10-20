import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { Formatter } from "../compiler/formatter/Formatter";
import type { FormatterOptions } from "../compiler/formatter/FormatterOptions";
import { formatterSemantics } from "./helpers/formatterSemantics";

const tick = String.fromCharCode(96);
const sources = [
  "frame main(){local result:int=- -value;}",
  "frame main(){local result:int=- /# sign #/ -value;}",
  `frame main(){local text:String=${tick}tick \\${tick} \\b quote\\"${tick}; # tail\n}`,
  `frame main(){local text:String=${tick}\${1 /# value #/} tick \\${tick}${tick};}`,
];
const expectedSnippets = [
  "- -value",
  "- /# sign #/ -value",
  'tick \\` \\b quote\\"',
  "${1 /# value #/} tick \\`",
];
const profiles: Array<{
  name: string;
  options: FormatterOptions;
  indent: string;
}> = [
  { name: "default", options: {}, indent: "    " },
  { name: "two spaces", options: { indentWidth: 2 }, indent: "  " },
  { name: "tabs", options: { useTabs: true }, indent: "\t" },
  { name: "CRLF", options: { lineEnding: "crlf" }, indent: "    " },
];
for (const profile of profiles)
  for (const [index, source] of sources.entries()) {
    test(`configured formatter retains operators/literals: ${profile.name} ${index}`, () => {
      const before = new Parser(source, "configured-regression.bpl").parse();
      const output = new Formatter(profile.options).format(before);
      expect(output).toContain(expectedSnippets[index]!);
      const after = new Parser(output, "configured-regression.bpl").parse();
      expect(formatterSemantics(after)).toEqual(formatterSemantics(before));
      expect(new Formatter(profile.options).format(after)).toBe(output);
      expect(output).toContain("\n" + profile.indent + "local");
      expect(
        output.endsWith(profile.options.lineEnding === "crlf" ? "\r\n" : "\n"),
      ).toBe(true);
    });
  }
