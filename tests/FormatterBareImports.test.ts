import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { Formatter } from "../compiler/formatter/Formatter";
import { formatterSemantics } from "./helpers/formatterSemantics";

for (const source of [
  'import "./module.bpl";frame main(){}',
  'import # module\n"./module.bpl";frame main(){}',
]) {
  test(`bare imports preserve syntax: ${JSON.stringify(source)}`, () => {
    const before = new Parser(source, "imports.bpl").parse();
    const output = new Formatter().format(before);
    const after = new Parser(output, "imports.bpl").parse();
    expect(formatterSemantics(after)).toEqual(formatterSemantics(before));
    expect(new Formatter().format(after)).toBe(output);
  });
}
