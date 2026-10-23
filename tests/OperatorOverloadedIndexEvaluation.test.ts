import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

const declarations = `global trace:int=0;global receiverCalls:int=0;global indices:int=0;global getters:int=0;
struct Box{
 value:int,
 frame __neg__(this:*Box)ret int{trace=trace*10+5;return -this.value;}
 frame __add__(this:*Box,other:int)ret int{trace=trace*10+5;return this.value+other;}
 frame __mul__(this:*Box,other:*Box)ret int{trace=trace*10+5;other.value=other.value+1;return this.value+other.value;}
}
struct Holder{box:Box,}
struct Source{
 frame __get__(this:*Source,index:int)ret Box{this;getters=getters+1;trace=trace*10+3;return Box{value:7+index};}
}
struct HolderSource{
 frame __get__(this:*HolderSource,index:int)ret Holder{this;getters=getters+1;trace=trace*10+3;return Holder{box:Box{value:7+index}};}
}
frame source(value:*Source)ret *Source{receiverCalls=receiverCalls+1;trace=trace*10+1;return value;}
frame holderSource(value:*HolderSource)ret *HolderSource{receiverCalls=receiverCalls+1;trace=trace*10+1;return value;}
frame index()ret int{local result:int=indices;indices=indices+1;trace=trace*10+2;return result;}
frame right()ret int{trace=trace*10+4;return 3;}`;

for (const [name, setup, expression, expected, resultTrace] of [
  [
    "unary receiver",
    "local storage:Source=Source{};",
    "-(*source(&storage))[index()]",
    -7,
    1235,
  ],
  [
    "grouped unary receiver",
    "local storage:Source=Source{};",
    "-(((*source(&storage))[index()]))",
    -7,
    1235,
  ],
  [
    "nested member receiver",
    "local storage:HolderSource=HolderSource{};",
    "-(*holderSource(&storage))[index()].box",
    -7,
    1235,
  ],
  [
    "binary receiver",
    "local storage:Source=Source{};",
    "(*source(&storage))[index()]+right()",
    10,
    12345,
  ],
  [
    "borrowed binary argument",
    "local storage:Source=Source{};local box:Box=Box{value:1};",
    "box*(*source(&storage))[index()]",
    9,
    1235,
  ],
] as const) {
  test(`operators evaluate overloaded indexing once for ${name}`, () => {
    expectCorrectnessSuite([
      {
        name: name.replaceAll(" ", "-"),
        validateLlvm: true,
        source: `${declarations}frame main()ret int{${setup}local result:int=${expression};if(result!=${expected} || trace!=${resultTrace} || receiverCalls!=1 || indices!=1 || getters!=1)return 1;return 0;}`,
      },
    ]);
  }, 60000);
}
