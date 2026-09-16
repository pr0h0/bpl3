import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

// spec: R-EXC-2, R-EXC-3
test("caught throws restore the stack-depth counter at O0/O3", () => {
  expectCorrectnessSuite(
    [
      {
        name: "repeated-throwing-calls",
        source: `
frame fail() {throw 7;}
frame recoverOne() ret int {try {fail();}catch(e:int) {return e;}return 0;}
frame main() ret int {
 local count:int=0;
 loop(local i:int=0;i<10010;i++) {
  if(recoverOne()==7)count++;
 }
 if(count!=10010) {return 1;}return 0;
}`,
      },
      {
        name: "nested-handler-propagation",
        source: `
frame fail(depth:int) {
 if(depth==0) {throw 7;}
 fail(depth-1);
}
frame recover() ret int {
 try {
  try {fail(25);}catch(e:bool) {if(e)return 2;}
 } catch(e:int) {return e;}
 return 1;
}
frame main() ret int {
 loop(local i:int=0;i<512;i++) {if(recover()!=7)return 1;}
 return 0;
}`,
      },
    ].map((entry) => ({ ...entry, validateLlvm: true, expectedStdout: "" })),
  );
}, 60000);
