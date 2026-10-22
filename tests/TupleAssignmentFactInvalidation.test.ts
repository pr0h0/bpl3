import { test } from "bun:test";
import {
  expectCorrectnessSuite,
  expectRuntimeFailureSuite,
} from "./helpers/compilerCorrectness";

for (const [name, setup, assignment, read] of [
  [
    "pointer replacement",
    "local p:*Box=&box;local q:*Box=nullptr;",
    "(p.value,p)=(7,q);",
    "p.value",
  ],
  [
    "later target",
    "local p:*Box=&box;local q:*Box=nullptr;",
    "(p.value,p,p.value)=(7,q,8);",
    "box.value",
  ],
  [
    "aliased pointer replacement",
    "local p:*Box=&box;local q:*Box=nullptr;local alias:**Box=&p;",
    "(p.value,*alias)=(7,q);",
    "p.value",
  ],
  [
    "aggregate replacement",
    "local holder:Holder=Holder{p:&box};local q:*Box=nullptr;",
    "(holder.p.value,holder)=(7,Holder{p:q});",
    "holder.p.value",
  ],
] as const) {
  test(`tuple stores invalidate non-null facts after ${name}`, () => {
    expectRuntimeFailureSuite([
      {
        name: `tuple-facts-${name.replaceAll(" ", "-")}`,
        expectedMessage: "NULL POINTER ACCESS",
        source: `struct Box{value:int,}struct Holder{p:*Box,}
      frame main()ret int{local box:Box=Box{value:1};${setup}${assignment}return ${read};}`,
      },
    ]);
  }, 60000);
}

test("tuple stores invalidate a previously checked nonzero divisor", () => {
  expectRuntimeFailureSuite([
    {
      name: "tuple-divisor-facts",
      expectedMessage: "DIVISION BY ZERO",
      source: `frame main()ret int{
      local divisor:int=2;local value:int=10/divisor;
      (value,divisor)=(3,0);return value/divisor;
    }`,
    },
  ]);
}, 60000);

test("tuple stores preserve pointer replacement and evaluation order on valid values", () => {
  expectCorrectnessSuite([
    {
      name: "tuple-facts-valid-replacement",
      validateLlvm: true,
      source: `struct Box{value:int,}
    frame main()ret int{
      local first:Box=Box{value:1};local second:Box=Box{value:2};
      local p:*Box=&first;local q:*Box=&second;
      (p.value,p,p.value)=(7,q,8);
      if(first.value!=7 || second.value!=8 || p.value!=8)return 1;
      local divisor:int=2;local value:int=10/divisor;
      (value,divisor)=(12,3);if(value/divisor!=4)return 2;
      return 0;
    }`,
    },
  ]);
}, 60000);
