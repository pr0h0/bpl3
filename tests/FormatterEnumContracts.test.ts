import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { Formatter } from "../compiler/formatter/Formatter";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";
import { formatterSemantics } from "./helpers/formatterSemantics";

const sources = [
  "enum Choice:Marker{A,B}",
  "enum Choice<T>:Marker<T>,Other{A(T),B}",
  "enum Choice: /# contract #/ Marker{A,B}",
];
for (const source of sources) {
  test(`enum formatter preserves implemented specs: ${JSON.stringify(source)}`, () => {
    const before = new Parser(source, "enum-contract.bpl").parse();
    const output = new Formatter().format(before);
    expect(output).toContain("enum Choice");
    expect(output).toContain("Marker");
    const after = new Parser(output, "enum-contract.bpl").parse();
    expect(formatterSemantics(after)).toEqual(formatterSemantics(before));
    expect(new Formatter().format(after)).toBe(output);
  });
}

test("implemented enum specs survive native formatting at O0 and O3", () => {
  const source = `import [printf] from "std/c.bpl";
spec Marker{}
enum Choice:Marker{A(int),B}
frame main()ret int{
local choice:Choice=Choice.A(9);
local result:int=match(choice){Choice.A(value)=>value,Choice.B=>0};
printf("%d\\n",result);return 0;
}`;
  const formatted = new Formatter().format(
    new Parser(source, "enum-native.bpl").parse(),
  );
  expect(formatted).toContain("enum Choice: Marker");
  expectCorrectnessSuite([
    { name: "original-enum-contract", source, expectedStdout: "9\n" },
    {
      name: "formatted-enum-contract",
      source: formatted,
      expectedStdout: "9\n",
    },
  ]);
}, 30000);
