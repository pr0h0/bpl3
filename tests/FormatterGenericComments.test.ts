import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { Formatter } from "../compiler/formatter/Formatter";
import { formatterSemantics } from "./helpers/formatterSemantics";

const cases = [
  {
    name: "generic declaration parameters",
    source: "frame f<T, # first\nU>(value:T)ret U{}",
    expected: "frame f<\n    T, # first\n    U\n>(value: T) ret U {\n}\n",
  },
  {
    name: "generic type arguments",
    source: "type Pair = Map<int, # key\nstring>;",
    expected: "type Pair = Map<\n    int, # key\n    string\n>;\n",
  },
  {
    name: "nested generic close with adjacent assignment",
    source: "frame main(){local value:Outer<Inner<int # value\n>>=nullptr;}",
    expected:
      "frame main() {\n    local value: Outer<\n        Inner<\n            int # value\n        >\n    > = nullptr;\n}\n",
  },
  {
    name: "generic call arguments",
    source: "frame main(){f<int, # first\nstring>(1);}",
    expected:
      "frame main() {\n    f<\n        int, # first\n        string\n    >(1);\n}\n",
  },
];
for (const fixture of cases) {
  test(`generic comments use continuation indentation: ${fixture.name}`, () => {
    const ast = new Parser(fixture.source, "generic-comments.bpl").parse();
    const formatted = new Formatter().format(ast);
    expect(formatted).toBe(fixture.expected);
    const after = new Parser(formatted, "generic-comments.bpl").parse();
    expect(formatterSemantics(after)).toEqual(formatterSemantics(ast));
    expect(new Formatter().format(after)).toBe(formatted);
  });
}

test("generic layout leaves comparison and shift operators intact", () => {
  const source = `frame main(){
local less:bool=1 < # less
2;
local greater:bool=3 > # greater
2;
local equal:bool=3 /# compare #/ >= 2;
local shift:int=8 >> # shift
1;
if(less && greater){shift;}
}`;
  const before = new Parser(source, "comparison-comments.bpl").parse();
  const output = new Formatter().format(before);
  expect(output).toContain("8 >> # shift");
  expect(output).toContain("3 /# compare #/ >= 2");
  const after = new Parser(output, "comparison-comments.bpl").parse();
  expect(formatterSemantics(after)).toEqual(formatterSemantics(before));
  expect(new Formatter().format(after)).toBe(output);
});
