import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { Formatter } from "../compiler/formatter/Formatter";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("generic-list comments retain native behavior at O0 and O3", () => {
  const source = `import [printf] from "std/c.bpl";
struct Inner<T>{value:T,}
struct Outer<T>{value:T,}
frame first<T, # left type
U>(left:T,right:U)ret T{right;return left;}
frame main()ret int{
local nested:Outer<Inner<int # inner type
>>=Outer<Inner<int>>{value:Inner<int>{value:first<int, # first type
int>(7,9)}};
printf("%d %d\\n",nested.value.value,8 >> # shift count
1);
return 0;
}`;
  const formatted = new Formatter().format(
    new Parser(source, "generic-comments-native.bpl").parse(),
  );
  expect(formatted).toContain("frame first<\n");
  expect(formatted).toContain("8 >> # shift count");
  expectCorrectnessSuite([
    { name: "original-generic-comments", source, expectedStdout: "7 4\n" },
    {
      name: "formatted-generic-comments",
      source: formatted,
      expectedStdout: "7 4\n",
    },
  ]);
}, 30000);
