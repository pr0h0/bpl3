import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const [name, source] of [
  [
    "generic function",
    `struct Box<T>{value:T,
      frame __get__(this:*Box<T>,index:int)ret T{index;return this.value;}
      frame __set__(this:*Box<T>,index:int,value:T){index;this.value=value;}}
    frame put<T>(box:*Box<T>,value:T)ret T{return (*box)[0]=value;}
    frame main()ret int{
      local a:Box<int>=Box<int>{value:0};local b:Box<long>=Box<long>{value:0};
      local x:int=put<int>(&a,7);local y:long=put<long>(&b,9);
      if(a.value!=7 || b.value!=9 || x!=7 || y!=9)return 1;return 0;}`,
  ],
  [
    "generic enclosing method",
    `struct Box<T>{value:T,
      frame __get__(this:*Box<T>,index:int)ret T{index;return this.value;}
      frame __set__(this:*Box<T>,index:int,value:T)ret T{index;this.value=value;return value;}}
    struct Writer<T>{box:Box<T>,frame put(this:*Writer<T>,value:T)ret T{return this.box[0]=value;}}
    frame main()ret int{local writer:Writer<int>=Writer<int>{box:Box<int>{value:0}};
      local result:int=writer.put(7);if(result!=7 || writer.box.value!=7)return 1;return 0;}`,
  ],
] as const) {
  test(`checked setters instantiate signatures in a ${name}`, () => {
    expectCorrectnessSuite([
      { name: name.replaceAll(" ", "-"), source, validateLlvm: true },
    ]);
  }, 60000);
}
