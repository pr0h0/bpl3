import { test } from "bun:test";
import {
  expectCorrectnessSuite,
  expectCleanFailureSuite,
} from "./helpers/compilerCorrectness";

for (const [name, expression] of Object.entries({
  match: "(match(flag(true)){true=>[next(),9],false=>[99,98],})[index()]",
  conditional: "(flag(true)?[next(),9]:[99,98])[index()]",
  nested:
    "(match(flag(true)){true=>[[next(),9],[8,6]],false=>[[99,98],[97,96]],})[index()][index()]",
  field: "(Box{values:[next(),9]}).values[index()]",
  tuple: "([next(),9],0).0[index()]",
  call: "((array()))[index()]",
})) {
  test(`temporary array indexing: ${name} at O0/O3`, () => {
    let expectedCalls = 2;
    if (["match", "conditional"].includes(name)) expectedCalls = 3;
    if (name === "nested") expectedCalls = 4;
    expectCorrectnessSuite([
      {
        name: `temporary-array-${name}`,
        validateLlvm: true,
        source: `struct Box{values:int[2],}
global calls:int=0;
frame next()ret int{calls=calls+1;return 7;}
frame flag(value:bool)ret bool{calls=calls+1;return value;}
frame index()ret int{calls=calls+1;return 0;}
frame array()ret int[2]{return [next(),9];}
frame main()ret int{local value:int=${expression};if(value!=7||calls!=${expectedCalls}){return 1;}return 0;}`,
        expectedStdout: "",
      },
    ]);
  }, 60000);
}

for (const [name, expression] of Object.entries({
  sliceMatch: "(match(flag()){true=>left,false=>right,})[index()]",
  sliceConditional: "(flag()?left:right)[index()]",
  pointerMatch:
    "(match(flag()){true=>cast<*int>(a),false=>cast<*int>(b),})[index()]",
  pointerConditional: "(flag()?cast<*int>(a):cast<*int>(b))[index()]",
})) {
  test(`temporary borrowed index base: ${name} at O0/O3`, () => {
    expectCorrectnessSuite([
      {
        name: `temporary-index-${name}`,
        validateLlvm: true,
        source: `global order:int=0;
frame flag()ret bool{order=order*10+1;return true;}
frame index()ret int{order=order*10+2;return 1;}
frame main()ret int{local a:int[2]=[6,7];local b:int[2]=[8,9];${name.startsWith("slice") ? "local left:int[]=a;local right:int[]=b;" : ""}local result:int=${expression};if(result!=7||order!=12){return 1;}return 0;}`,
        expectedStdout: "",
      },
    ]);
  }, 60000);
}

test("temporary indexed aliases and generic values retain their representation at O0/O3", () => {
  expectCorrectnessSuite([
    {
      name: "temporary-index-alias-generic",
      validateLlvm: true,
      source: `type Fixed=int[2];
frame choose<T>(v:T)ret T{return v;}
frame main()ret int{local values:Fixed=[6,7];local ptr:*int=cast<*int>(values);if((choose<Fixed>(values))[1]!=7)return 1;if((ptr+1)[0]!=7)return 2;return 0;}`,
      expectedStdout: "",
    },
  ]);
}, 60000);

test("read materialization does not permit assigning or taking addresses of temporary array elements", () => {
  expectCleanFailureSuite([
    {
      name: "match-array-element-address",
      expectedMessage: "Expression is not an lvalue: Match",
      source:
        "frame bad()ret *int{return &(match(true){true=>[1,2],false=>[3,4],})[0];}frame main()ret int{return *bad();}",
    },
    {
      name: "match-array-element-assignment",
      expectedMessage: "Expression is not an lvalue: Match",
      source: "frame main(){(match(true){true=>[1,2],false=>[3,4],})[0]=9;}",
    },
    {
      name: "conditional-array-element-address",
      expectedMessage: "Expression is not an lvalue: Ternary",
      source:
        "frame bad()ret *int{return &(true?[1,2]:[3,4])[0];}frame main()ret int{return *bad();}",
    },
  ]);
}, 60000);
