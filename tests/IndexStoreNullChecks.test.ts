import { test } from "bun:test";
import {
  expectCorrectnessSuite,
  expectRuntimeFailureSuite,
} from "./helpers/compilerCorrectness";

for (const [name, declarations, setup, statement] of [
  ["pointer", "", "local p:*int=nullptr;", "p[0]=7;"],
  ["compound pointer", "", "local p:*int=nullptr;", "p[0]+=7;"],
  ["computed pointer", "", "local p:*int=nullptr;", "(true?p:p)[0]=7;"],
  [
    "pointer call",
    "frame pointer(p:*int)ret *int{return p;}",
    "local p:*int=nullptr;",
    "pointer(p)[0]=7;",
  ],
  [
    "array alias pointer",
    "type Row=int[2];",
    "local p:*Row=nullptr;",
    "p[1]=7;",
  ],
  ["increment control", "", "local p:*int=nullptr;", "++p[0];"],
] as const) {
  test(`indexed ${name} stores retain the null diagnostic`, () => {
    expectRuntimeFailureSuite([
      {
        name: `null-index-store-${name.replaceAll(" ", "-")}`,
        expectedMessage: "NULL POINTER ACCESS",
        source: `${declarations}frame main()ret int{${setup}${statement}return 0;}`,
      },
    ]);
  }, 60000);
}

test("normal index stores preserve receiver/index/value order and compound writes", () => {
  expectCorrectnessSuite([
    {
      name: "checked-index-store-order",
      validateLlvm: true,
      source: `global trace:int=0;
    frame pointer(p:*int)ret *int{trace=trace*10+1;return p;}
    frame index()ret int{trace=trace*10+2;return 1;}
    frame value()ret int{trace=trace*10+3;return 7;}
    frame main()ret int{
      local values:int[2]=[1,2];pointer(&values[0])[index()]=value();
      if(trace!=123 || values[1]!=7)return 1;
      trace=0;pointer(&values[0])[index()]+=value();
      if(trace!=123 || values[1]!=14)return 2;return 0;
    }`,
    },
  ]);
}, 60000);
