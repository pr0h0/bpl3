import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { Formatter } from "../compiler/formatter/Formatter";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";
import { formatterSemantics } from "./helpers/formatterSemantics";

for (const source of [
  "extern f(const value:int)ret int;",
  "extern f(value:const int)ret int;",
  "extern f(const value:*char)ret int;",
  "extern f(const format:string,...);",
  "extern f(const value:int, # constant\nother:int)ret int;",
]) {
  test(`extern parameters retain qualifiers: ${JSON.stringify(source)}`, () => {
    const before = new Parser(source, "externs.bpl").parse();
    const output = new Formatter().format(before);
    const after = new Parser(output, "externs.bpl").parse();
    expect(formatterSemantics(after)).toEqual(formatterSemantics(before));
    expect(new Formatter().format(after)).toBe(output);
  });
}

test("extern const parameters preserve native calls after formatting", () => {
  const source =
    'import [printf] from "std/c.bpl";extern abs(const value:int)ret int;frame main()ret int{printf("%d\\n",abs(-7));return 0;}';
  const formatted = new Formatter().format(
    new Parser(source, "extern-native.bpl").parse(),
  );
  expect(formatted).toContain("const value: int");
  expectCorrectnessSuite([
    { name: "original-extern-const", source, expectedStdout: "7\n" },
    {
      name: "formatted-extern-const",
      source: formatted,
      expectedStdout: "7\n",
    },
  ]);
}, 30000);
