import { test } from "bun:test";
import {
  expectCorrectnessSuite,
  expectRuntimeFailureSuite,
} from "./helpers/compilerCorrectness";

for (const [name, declarations, setup, target] of [
  [
    "member identifier",
    "struct Box{value:int,}",
    "local p:*Box=nullptr;",
    "p.value",
  ],
  [
    "member call",
    "struct Box{value:int,}frame pointer(p:*Box)ret *Box{return p;}",
    "local p:*Box=nullptr;",
    "pointer(p).value",
  ],
  [
    "member conditional",
    "struct Box{value:int,}frame pointer(p:*Box)ret *Box{return p;}",
    "local p:*Box=nullptr;",
    "(true?pointer(p):pointer(p)).value",
  ],
  ["pointer index", "", "local p:*int=nullptr;", "p[0]"],
  [
    "computed pointer index",
    "frame pointer(p:*int)ret *int{return p;}",
    "local p:*int=nullptr;",
    "(true?pointer(p):pointer(p))[0]",
  ],
  ["dereference control", "", "local p:*int=nullptr;", "*p"],
] as const) {
  test(`tuple assignment retains null diagnostics for ${name}`, () => {
    expectRuntimeFailureSuite([
      {
        name: `tuple-null-${name.replaceAll(" ", "-")}`,
        expectedMessage: "NULL POINTER ACCESS",
        source: `${declarations}frame main()ret int{${setup}local other:int=0;(${target},other)=(7,9);return other;}`,
      },
    ]);
  }, 60000);
}

test("tuple targets preserve RHS-first then left-to-right single evaluation", () => {
  expectCorrectnessSuite([
    {
      name: "tuple-target-address-order",
      validateLlvm: true,
      source: `struct Box{value:int,}
    global trace:int=0;
    frame values()ret (int,int){trace=1;return (7,9);}
    frame member(p:*Box)ret *Box{trace=trace*10+2;return p;}
    frame pointer(p:*int)ret *int{trace=trace*10+3;return p;}
    frame index()ret int{trace=trace*10+4;return 1;}
    frame main()ret int{
      local box:Box=Box{value:1};local data:int[2]=[2,3];
      ((true?member(&box):member(&box)).value,pointer(&data[0])[index()])=values();
      if(trace!=1234 || box.value!=7 || data[0]!=2 || data[1]!=9)return 1;
      return 0;
    }`,
    },
  ]);
}, 60000);
