import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { Formatter } from "../compiler/formatter/Formatter";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("escaped interpolated literal text executes identically after formatting", () => {
  const tick = String.fromCharCode(96);
  const content = 'tick \\` tab\\tback\\bform\\f quote\\"';
  const source = `import [String] from "std/string.bpl";
import [printf] from "std/c.bpl";
frame main() ret int {
local text:String=${tick}${content}${tick};
printf("%s\\n",text.data);
text.destroy();
return 0;
}`;
  const formatted = new Formatter().format(
    new Parser(source, "interpolation-native.bpl").parse(),
  );
  expect(formatted).toContain("\\`");
  expect(formatted).toContain("\\b");
  expectCorrectnessSuite([
    {
      name: "original-interpolation-escapes",
      source,
      expectedStdout: 'tick ` tab\tback\bform\f quote"\n',
    },
    {
      name: "formatted-interpolation-escapes",
      source: formatted,
      expectedStdout: 'tick ` tab\tback\bform\f quote"\n',
    },
  ]);
}, 30000);
