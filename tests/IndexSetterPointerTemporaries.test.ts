import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const [name, key, value, calls, mutatesKey, mutatesValue] of [
  ["returned index", "get()", "input", 1, false, true],
  ["returned value", "key", "get()", 1, true, false],
  ["returned index and value", "get()", "get()", 2, false, false],
  ["grouped returned pointers", "((get()))", "((get()))", 2, false, false],
  ["pointer variables control", "key", "input", 0, true, true],
] as const) {
  test(`setter borrows pointer storage for ${name}`, () => {
    expectCorrectnessSuite([
      {
        name: name.replaceAll(" ", "-"),
        validateLlvm: true,
        source: `struct Node{value:int,}global shared:*Node=nullptr;global calls:int=0;
      frame get()ret *Node{calls=calls+1;return shared;}
      struct Box{seen:int,frame __get__(this:*Box,index:*Node)ret *Node{index;return nullptr;}
        frame __set__(this:*Box,index:**Node,value:**Node){if(*index!=nullptr && *value!=nullptr)this.seen=1;*index=nullptr;*value=nullptr;}}
      frame main()ret int{local node:Node=Node{value:7};shared=&node;local box:Box=Box{seen:0};local key:*Node=&node;local input:*Node=&node;
        local result:*Node=(box[${key}]=${value});
        if(box.seen!=1 || calls!=${calls} || result!=&node || node.value!=7)return 1;
        if((key==nullptr)!=${mutatesKey} || (input==nullptr)!=${mutatesValue})return 2;
        return 0;}`,
      },
    ]);
  }, 60000);
}
