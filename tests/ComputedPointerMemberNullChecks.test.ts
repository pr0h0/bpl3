import { test } from "bun:test";
import {
  expectCorrectnessSuite,
  expectRuntimeFailureSuite,
} from "./helpers/compilerCorrectness";

for (const [name, expression] of [
  ["call", "holder()"],
  ["grouped call", "((holder()))"],
  ["conditional", "(true?holder():holder())"],
  ["match", "(match(true){true=>holder(),false=>holder(),})"],
  ["cast", "cast<*Holder>(holder())"],
] as const) {
  test(`nested member write checks null ${name} receiver before loading its pointer field`, () => {
    expectRuntimeFailureSuite([
      {
        name: `nested-null-${name.replaceAll(" ", "-")}`,
        expectedMessage: "NULL POINTER ACCESS",
        source: `struct Box{value:int,}struct Holder{p:*Box,}
      frame holder()ret *Holder{return nullptr;}
      frame main()ret int{${expression}.p.value=7;return 0;}`,
      },
    ]);
  }, 60000);
}

test("reading a field through a computed pointer retains its null diagnostic", () => {
  expectRuntimeFailureSuite([
    {
      name: "computed-null-member-read",
      expectedMessage: "NULL POINTER ACCESS",
      source: `struct Box{value:int,}
    frame pointer()ret *Box{return nullptr;}
    frame main()ret int{return (true?pointer():pointer()).value;}`,
    },
  ]);
}, 60000);

test("nested computed pointer reads and writes evaluate the receiver once", () => {
  expectCorrectnessSuite([
    {
      name: "nested-computed-pointer-member-order",
      validateLlvm: true,
      source: `struct Box{value:int,}struct Holder{p:*Box,}
    global calls:int=0;
    frame holder(v:*Holder)ret *Holder{calls=calls+1;return v;}
    frame main()ret int{
      local box:Box=Box{value:1};local value:Holder=Holder{p:&box};
      holder(&value).p.value+=5;
      local field:*int=&((holder(&value))).p.value;*field+=2;
      local observed:int=(true?holder(&value):holder(&value)).p.value;
      if(calls!=3 || observed!=8 || box.value!=8)return 1;
      return 0;
    }`,
    },
  ]);
}, 60000);
