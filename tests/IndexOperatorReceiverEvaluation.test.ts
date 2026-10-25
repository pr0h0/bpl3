import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

const declarations = `global trace:int=0;global calls:int=0;global observed:int=0;
struct Box{
 value:int,
 frame __get__(this:*Box,index:int)ret int{trace=trace*10+3;return this.value+index;}
 frame __set__(this:*Box,index:int,value:int){trace=trace*10+4;this.value=value+index;observed=this.value;}
}
struct Holder{box:Box,}
frame next()ret int{calls=calls+1;trace=trace*10+1;return 0;}
frame make()ret Box{calls=calls+1;trace=trace*10+1;return Box{value:1};}
frame index()ret int{trace=trace*10+2;return 3;}
frame value()ret int{trace=trace*10+3;return 7;}`;

for (const [name, setup, receiver, field] of [
  [
    "indexed",
    "local boxes:Box[2]=[Box{value:1},Box{value:2}];",
    "boxes[next()]",
    "boxes[0].value",
  ],
  [
    "grouped indexed",
    "local boxes:Box[2]=[Box{value:1},Box{value:2}];",
    "((boxes[next()]))",
    "boxes[0].value",
  ],
  [
    "nested member",
    "local holders:Holder[2]=[Holder{box:Box{value:1}},Holder{box:Box{value:2}}];",
    "holders[next()].box",
    "holders[0].box.value",
  ],
  ["temporary call control", "", "make()", "observed"],
  ["conditional temporary control", "", "(true?make():make())", "observed"],
] as const) {
  test(`overloaded getter evaluates ${name} receiver once before its index`, () => {
    expectCorrectnessSuite([
      {
        name: `get-${name.replaceAll(" ", "-")}`,
        validateLlvm: true,
        source: `${declarations}frame main()ret int{${setup}
        local result:int=${receiver}[index()];
        if(result!=4 || trace!=123 || calls!=1)return 1;return 0;
      }`,
      },
    ]);
  }, 60000);
  test(`overloaded setter evaluates ${name} receiver then index then value once`, () => {
    expectCorrectnessSuite([
      {
        name: `set-${name.replaceAll(" ", "-")}`,
        validateLlvm: true,
        source: `${declarations}frame main()ret int{${setup}
        ${receiver}[index()]=value();
        if(trace!=1234 || calls!=1 || observed!=10 || ${field}!=10)return 1;return 0;
      }`,
      },
    ]);
  }, 60000);
}
