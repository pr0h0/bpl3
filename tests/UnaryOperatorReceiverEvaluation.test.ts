import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

const declarations = `global calls:int=0;
struct Box{value:int,frame __neg__(this:*Box)ret int{this.value=this.value+1;return -this.value;}}
struct Holder{box:Box,}
frame next()ret int{calls=calls+1;return 0;}
frame pointer(value:*Box)ret *Box{calls=calls+1;return value;}
frame holderPointer(value:*Holder)ret *Holder{calls=calls+1;return value;}
frame make()ret Box{calls=calls+1;return Box{value:7};}`;

for (const [name, setup, receiver, observed] of [
  [
    "indexed",
    "local boxes:Box[1]=[Box{value:7}];",
    "boxes[next()]",
    "boxes[0].value",
  ],
  [
    "grouped indexed",
    "local boxes:Box[1]=[Box{value:7}];",
    "((boxes[next()]))",
    "boxes[0].value",
  ],
  [
    "nested member",
    "local holders:Holder[1]=[Holder{box:Box{value:7}}];",
    "holders[next()].box",
    "holders[0].box.value",
  ],
  [
    "dereferenced call",
    "local box:Box=Box{value:7};",
    "(*pointer(&box))",
    "box.value",
  ],
  [
    "computed pointer member",
    "local holder:Holder=Holder{box:Box{value:7}};",
    "holderPointer(&holder).box",
    "holder.box.value",
  ],
  ["temporary call control", "", "make()", "8"],
  ["conditional temporary control", "", "(true?make():make())", "8"],
] as const) {
  test(`unary operator evaluates ${name} receiver once and preserves storage`, () => {
    expectCorrectnessSuite([
      {
        name: `unary-${name.replaceAll(" ", "-")}`,
        validateLlvm: true,
        source: `${declarations}frame main()ret int{${setup}
        local result:int=-${receiver};
        if(result!=-8 || calls!=1 || ${observed}!=8)return 1;return 0;}`,
      },
    ]);
  }, 60000);
}
