import { test } from "bun:test";
import {
  expectCorrectnessSuite,
  expectRuntimeFailureSuite,
} from "./helpers/compilerCorrectness";

for (const [name, expression] of [
  ["conditional true", "(true?pointer(&box):pointer(&other))"],
  ["conditional false", "(false?pointer(&other):pointer(&box))"],
  ["match", "(match(false){true=>pointer(&other),false=>pointer(&box),})"],
  ["cast", "cast<*Box>(pointer(&box))"],
  ["address", "(&box)"],
  ["grouped call", "((pointer(&box)))"],
  ["grouped identifier", "((p))"],
  ["identifier control", "p"],
  ["call control", "pointer(&box)"],
  ["temporary array element", "[&box,&other][0]"],
  ["returned array element", "array(&box)[1]"],
  ["temporary pointer field", "(Holder{p:&box}).p"],
  ["returned tuple pointer", "pair(&box).1"],
] as const) {
  test(`borrowed ${name} pointer fields support writes and addresses`, () => {
    expectCorrectnessSuite([
      {
        name: name.replaceAll(" ", "-"),
        validateLlvm: true,
        source: `struct Box{value:int,}
      struct Holder{p:*Box,}
      frame pointer(v:*Box)ret *Box{return v;}
      frame array(v:*Box)ret *Box[2]{return [v,v];}
      frame pair(v:*Box)ret (int,*Box){return (1,v);}
      frame main()ret int{
        local box:Box=Box{value:1};local other:Box=Box{value:3};${expression === "((p))" || expression === "p" ? "local p:*Box=&box;" : ""}
        ${expression}.value=7;
        ${expression}.value+=2;
        local field:*int=&${expression}.value;*field+=2;
        if(box.value!=11 || other.value!=3)return 1;
        return 0;
      }`,
      },
    ]);
  }, 60000);
}

test("computed pointer member bases evaluate exactly once per field address", () => {
  expectCorrectnessSuite([
    {
      name: "computed-pointer-member-order",
      validateLlvm: true,
      source: `struct Box{value:int,}
    global trace:int=0;
    frame choose()ret bool{trace=trace*10+1;return false;}
    frame pointer(v:*Box)ret *Box{trace=trace*10+2;return v;}
    frame wrong(v:*Box)ret *Box{trace=9;return v;}
    frame rhs()ret int{trace=trace*10+3;return 5;}
    frame main()ret int{
      local box:Box=Box{value:2};
      (choose()?wrong(&box):pointer(&box)).value+=rhs();
      if(trace!=123 || box.value!=7)return 1;
      return 0;
    }`,
    },
  ]);
}, 60000);

for (const [name, expression] of [
  ["conditional", "(true?pointer(box):pointer(box))"],
  ["grouped call", "((pointer(box)))"],
  ["cast", "cast<*Box>(pointer(box))"],
] as const) {
  test(`computed ${name} member writes keep null diagnostics`, () => {
    expectRuntimeFailureSuite([
      {
        name: `null-member-${name.replaceAll(" ", "-")}`,
        expectedMessage: "NULL POINTER ACCESS",
        source: `struct Box{value:int,}
      frame pointer(v:*Box)ret *Box{return v;}
      frame main()ret int{local box:*Box=nullptr;${expression}.value=7;return 0;}`,
      },
    ]);
  }, 60000);
}
