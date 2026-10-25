import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const [name, keyType, key, value, expected] of [
  ["null index", "*Node", "nullptr", "input", 1],
  ["null value", "int", "0", "nullptr", 2],
  ["both null", "*Node", "nullptr", "nullptr", 3],
  ["typed pointer control", "*Node", "input", "input", 0],
] as const) {
  const checkKey =
    keyType === "int" ? "index;" : "if(index==nullptr)this.seen=this.seen+1;";
  test(`checked setters preserve ${name} pointer values`, () => {
    expectCorrectnessSuite([
      {
        name: name.replaceAll(" ", "-"),
        validateLlvm: true,
        source: `struct Node{value:int,}
      struct Box{seen:int,
        frame __get__(this:*Box,index:${keyType})ret *Node{index;return nullptr;}
        frame __set__(this:*Box,index:${keyType},value:*Node){${checkKey}if(value==nullptr)this.seen=this.seen+2;}}
      frame main()ret int{local node:Node=Node{value:7};local input:*Node=&node;input;
        local box:Box=Box{seen:0};local result:*Node=(box[${key}]=${value});
        if(box.seen!=${expected})return 1;
        if(result!=${value})return 2;return 0;}`,
      },
    ]);
  }, 60000);
}
