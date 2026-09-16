import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

// spec: R-CTRL-3, R-EXC-2
test("loop-local storage stays bounded at O0/O3", () => {
  expectCorrectnessSuite(
    [
      {
        name: "handler-frame-in-loop",
        source: `
frame fail() {throw 7;}
frame main() ret int {
 local count:int=0;
 loop(local i:int=0;i<10010;i++) {
  try {fail();}catch(e:int) {if(e==7)count++;}
 }
 if(count!=10010) {return 1;}return 0;
}`,
      },
      {
        name: "fixed-array-local-in-loop",
        source: `
frame touch(values:*int,value:int) ret int {values[255]=value;return values[255];}
frame main() ret int {
 local sum:int=0;
 loop(local i:int=0;i<20000;i++) {
  local values:int[256];
  sum+=touch(values,i%2);
 }
 if(sum!=10000) {return 1;}return 0;
}`,
      },
      {
        name: "enum-temporary-in-loop",
        source: `
enum Box {Some(int[256]),None,}
frame main() ret int {
 local sum:int=0;local values:int[256];values[0]=1;
 loop(local i:int=0;i<20000;i++) {
  local box:Box=Box.Some(values);
  sum+=match(box) {Box.Some(items)=>items[0],Box.None=>0,};
 }
 if(sum!=20000) {return 1;}return 0;
}`,
      },
    ].map((entry) => ({ ...entry, validateLlvm: true, expectedStdout: "" })),
  );
}, 120000);
