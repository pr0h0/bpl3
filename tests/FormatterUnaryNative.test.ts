import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { Formatter } from "../compiler/formatter/Formatter";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("formatting preserves unary values and side effects at O0 and O3", () => {
  const source = `import [printf] from "std/c.bpl";
frame main() ret int {
local value:int=5;
local negation:int=- -value;
local decrement:int=- --value;
printf("%d %d %d\\n",negation,decrement,value);
return 0;
}`;
  const formatted = new Formatter().format(
    new Parser(source, "unary-native.bpl").parse(),
  );
  expect(formatted).toContain("- -value");
  expectCorrectnessSuite([
    { name: "original-unary", source, expectedStdout: "5 -4 4\n" },
    {
      name: "formatted-unary",
      source: formatted,
      expectedStdout: "5 -4 4\n",
    },
  ]);
}, 30000);
