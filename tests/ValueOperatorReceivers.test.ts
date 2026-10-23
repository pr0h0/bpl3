import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { CodeGenerator } from "../compiler/backend/CodeGenerator";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

const declarations = `global calls:int=0;
struct Box{
 value:int,
 frame __neg__(this:Box)ret int{this.value=this.value+1;return -this.value;}
 frame __add__(this:Box,other:int)ret int{this.value=this.value+other;return this.value;}
 frame __lt__(this:Box,other:int)ret bool{this.value=this.value+other;return this.value<other;}
 frame __mul__(this:Box,other:*int)ret int{this.value=this.value+*other;*other=99;return this.value;}
}
frame next()ret int{calls=calls+1;return 0;}
frame make()ret Box{calls=calls+1;return Box{value:7};}`;
for (const [name, setup, expression, expected, condition] of [
  ["unary mutable", "local box:Box=Box{value:7};", "-box", -8, "box.value==7"],
  [
    "unary const",
    "local const box:Box=Box{value:7};",
    "-box",
    -8,
    "box.value==7",
  ],
  [
    "unary indexed",
    "local boxes:Box[1]=[Box{value:7}];",
    "-boxes[next()]",
    -8,
    "calls==1 && boxes[0].value==7",
  ],
  ["unary temporary", "", "-make()", -8, "calls==1"],
  [
    "binary mutable",
    "local box:Box=Box{value:7};",
    "box+3",
    10,
    "box.value==7",
  ],
  [
    "binary const",
    "local const box:Box=Box{value:7};",
    "box+3",
    10,
    "box.value==7",
  ],
  [
    "binary indexed",
    "local boxes:Box[1]=[Box{value:7}];",
    "boxes[next()]+3",
    10,
    "calls==1 && boxes[0].value==7",
  ],
  [
    "swapped const",
    "local const box:Box=Box{value:7};",
    "cast<int>(3>box)",
    0,
    "box.value==7",
  ],
  [
    "borrowed argument",
    "local box:Box=Box{value:7};local numbers:int[1]=[3];",
    "box*numbers[next()]",
    10,
    "calls==1 && box.value==7 && numbers[0]==99",
  ],
] as const) {
  test(`operators pass ${name} receiver by value`, () => {
    const source = `${declarations}frame main()ret int{${setup}local result:int=${expression};if(result!=${expected} || !(${condition}))return 1;return 0;}`;
    const program = new Parser(source, "value-operators.bpl").parse();
    const checker = new TypeChecker({ collectAllErrors: true });
    checker.checkProgram(program);
    expect(checker.getErrors()).toEqual([]);
    const ir = new CodeGenerator().generate(program);
    const calls = ir
      .split("\n")
      .filter((line) => /call .*@Box___(?:neg|add|lt|mul)__/.test(line));
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call).toMatch(/\(%struct\.Box /);
      expect(call).not.toContain("(%struct.Box*");
    }
    expectCorrectnessSuite([
      { name: name.replaceAll(" ", "-"), source, validateLlvm: true },
    ]);
  }, 60000);
}

for (const [name, expression, result, stored] of [
  ["unary", "-pointer", -8, 8],
  ["binary control", "pointer+3", 10, 10],
] as const) {
  test(`operators retain explicit pointer ${name} receivers`, () => {
    const source = `struct Box{value:int,
      frame __neg__(this:*Box)ret int{this.value=this.value+1;return -this.value;}
      frame __add__(this:*Box,other:int)ret int{this.value=this.value+other;return this.value;}}
      frame main()ret int{local box:Box=Box{value:7};local pointer:*Box=&box;
      local result:int=${expression};if(result!=${result} || box.value!=${stored})return 1;return 0;}`;
    const program = new Parser(source, "pointer-operators.bpl").parse();
    const checker = new TypeChecker({ collectAllErrors: true });
    checker.checkProgram(program);
    expect(checker.getErrors()).toEqual([]);
    const ir = new CodeGenerator().generate(program);
    const calls = ir
      .split("\n")
      .filter((line) => /call .*@Box___(?:neg|add)__/.test(line));
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call).toMatch(/\(%struct\.Box\* /);
      expect(call).not.toContain("(%struct.Box**");
    }
    expectCorrectnessSuite([
      {
        name: `pointer-${name.replaceAll(" ", "-")}`,
        source,
        validateLlvm: true,
      },
    ]);
  }, 60000);
}
