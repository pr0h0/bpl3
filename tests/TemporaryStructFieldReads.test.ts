import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const [name, expression] of Object.entries({
  literal: "(Box{value:next()}).value",
  groupedPointerCall: "((pointer(&data))).value",
  generic: "(Generic<int>{value:next()}).value",
  conditional: "(flag(true)?Box{value:next()}:Box{value:99}).value",
  match:
    "(match(flag(true)){true=>Box{value:next()},false=>{return Box{value:99};},}).value",
  nested: "(Outer{box:Box{value:next()}}).box.value",
  tuple: "(Box{value:next()},0).0.value",
})) {
  test(`temporary struct field reads: ${name} at O0/O3`, () => {
    expectCorrectnessSuite([
      {
        name: `temporary-struct-${name}`,
        validateLlvm: true,
        source: `struct Box{value:int,}
struct Outer{box:Box,}
struct Generic<T>{value:T,}
global calls:int=0;
frame next()ret int{calls=calls+1;return 7;}
frame flag(value:bool)ret bool{calls=calls+1;return value;}
frame pointer(value:*Box)ret *Box{calls=calls+1;return value;}
frame main()ret int{${name === "groupedPointerCall" ? "local data:Box=Box{value:7};" : ""}local value:int=${expression};if(value!=7 || calls!=${["conditional", "match"].includes(name) ? 2 : 1}){return 1;}return 0;}`,
        expectedStdout: "",
      },
    ]);
  }, 60000);
}

test("temporary literal field reads retain caller-owned view storage at O0/O3", () => {
  expectCorrectnessSuite([
    {
      name: "temporary-struct-view-projection",
      validateLlvm: true,
      source: `struct Fields{temporary:int[],kept:int[],}
frame selected(v:int[])ret int[]{return (Fields{temporary:[1,2],kept:v}).kept;}
frame main()ret int{local data:int[2]=[11,12];local view:int[]=selected(data);view[1]=13;if(data[1]!=13){return 1;}return 0;}`,
      expectedStdout: "",
    },
  ]);
}, 60000);
