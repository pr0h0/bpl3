import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

const declarations = `global calls:int=0;global trace:int=0;
struct Box{value:int,frame __add__(this:*Box,other:int)ret int{trace=trace*10+3;this.value=this.value+other;return this.value;}frame __lt__(this:*Box,other:int)ret bool{trace=trace*10+3;this.value=this.value+other;return this.value<other;}}
struct PairBox{value:int,frame __add__(this:*PairBox,other:*PairBox)ret int{trace=trace*10+3;this.value=this.value+other.value;other.value=99;return this.value;}}
frame next()ret int{calls=calls+1;trace=trace*10+1;return 0;}
frame right()ret int{trace=trace*10+2;return 3;}
frame make()ret Box{calls=calls+1;trace=trace*10+1;return Box{value:7};}
frame leftIndex()ret int{trace=trace*10+1;return 0;}
frame rightIndex()ret int{calls=calls+1;trace=trace*10+2;return 1;}`;
for (const [name, setup, expression, condition] of [
  [
    "indexed receiver",
    "local boxes:Box[1]=[Box{value:7}];",
    "boxes[next()]+right()",
    "calls==1 && trace==123 && result==10 && boxes[0].value==10",
  ],
  [
    "swapped receiver",
    "local boxes:Box[1]=[Box{value:7}];",
    "cast<int>(right()>boxes[next()])",
    "calls==1 && trace==213 && result==0 && boxes[0].value==10",
  ],
  [
    "borrowed right argument",
    "local boxes:PairBox[2]=[PairBox{value:7},PairBox{value:3}];",
    "boxes[leftIndex()]+boxes[rightIndex()]",
    "calls==1 && trace==123 && result==10 && boxes[0].value==10 && boxes[1].value==99",
  ],
  [
    "temporary receiver control",
    "",
    "make()+right()",
    "calls==1 && trace==123 && result==10",
  ],
] as const) {
  test(`binary operator evaluates ${name} once in source order`, () => {
    expectCorrectnessSuite([
      {
        name: `binary-${name.replaceAll(" ", "-")}`,
        validateLlvm: true,
        source: `${declarations}frame main()ret int{${setup}local result:int=${expression};if(!(${condition}))return 1;return 0;}`,
      },
    ]);
  }, 60000);
}
