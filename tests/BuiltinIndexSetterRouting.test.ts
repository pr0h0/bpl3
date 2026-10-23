import { expect, test } from "bun:test";
import { CodeGenerator } from "../compiler/backend/CodeGenerator";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const [name, setup, target, field] of [
  ["fixed array", "", "values[0]", "values[0].value"],
  ["slice", "local view:Box[]=values;", "view[0]", "values[0].value"],
  ["raw pointer", "local p:*Box=&values[0];", "p[1]", "values[1].value"],
] as const) {
  test(`built-in ${name} element stores do not invoke an element setter`, () => {
    const source = `global setters:int=0;
      struct Box{value:int,
        frame __get__(this:*Box,index:int)ret int{return this.value+index;}
        frame __set__(this:*Box,index:int,value:int){setters+=1;this.value=value+index;}
      }
      frame main()ret int{
        local values:Box[2]=[Box{value:1},Box{value:2}];${setup}
        ${target}=Box{value:7};
        if(setters!=0 || ${field}!=7)return 1;return 0;
      }`;
    const program = new Parser(source, "builtin-index-store.bpl").parse();
    const checker = new TypeChecker({ collectAllErrors: true });
    checker.checkProgram(program);
    expect(checker.getErrors()).toEqual([]);
    const ir = new CodeGenerator().generate(program);
    // Check call routing before running native code with the selected element.
    expect(/call[^\n]*@Box___set__/.test(ir)).toBe(false);
    expectCorrectnessSuite([
      {
        name: `builtin-store-${name.replaceAll(" ", "-")}`,
        source,
        validateLlvm: true,
      },
    ]);
  }, 60000);
}
