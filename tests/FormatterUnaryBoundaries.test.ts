import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { Formatter } from "../compiler/formatter/Formatter";
import { formatterSemantics } from "./helpers/formatterSemantics";

for (const expression of [
  "- -value",
  "+ +value",
  "- --value",
  "+ ++value",
  "& &value",
  "! !value",
  "~ ~value",
  "* *value",
  "- /# sign #/ -value",
  "- # sign\n-value",
]) {
  test(`formatting retains unary token boundaries: ${expression}`, () => {
    const source = `frame main(){local result:int=${expression};}`;
    const before = new Parser(source, "unary.bpl").parse();
    const output = new Formatter().format(before);
    const after = new Parser(output, "unary.bpl").parse();
    expect(formatterSemantics(after)).toEqual(formatterSemantics(before));
    expect(new Formatter().format(after)).toBe(output);
  });
}
