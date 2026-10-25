import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { Formatter } from "../compiler/formatter/Formatter";
import { formatterSemantics } from "./helpers/formatterSemantics";

const tick = String.fromCharCode(96);
for (const content of [
  '\\b quote \\"',
  "\\f slash \\\\",
  '\\u0000 quote \\"',
  "\\u0007 slash \\\\",
  '\\u001f quote \\"',

  "tick \\` tail",
  "\\b",
  "\\f",
  "\\u0000",
  "\\u0007",
  "\\u001f",
  "\\t",
  "backslash \\\\ and \\${literal}",
  "${1 /# value #/} tick \\` tail",
]) {
  for (const comment of ["", " # trailing comment"]) {
    test(`interpolated escapes survive formatting: ${JSON.stringify(content)} ${comment}`, () => {
      const source = `frame main(){local text:String=${tick}${content}${tick};${comment}\n}`;
      const before = new Parser(source, "escape.bpl").parse();
      const formatted = new Formatter().format(before);
      const after = new Parser(formatted, "escape.bpl").parse();
      expect(formatterSemantics(after)).toEqual(formatterSemantics(before));
      expect(new Formatter().format(after)).toBe(formatted);
    });
  }
}
