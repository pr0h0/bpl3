import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

// spec: R-EXC-2
test("catches observe local updates across nonlocal returns at O0/O3", () => {
  expectCorrectnessSuite(
    [
      {
        name: "scalar-and-parameter-state",
        source: `
frame check(value:int) ret int {
 local changed:int=0;
 try {changed=42;value+=5;throw 1;}
 catch(e:int) {if(e!=1 || changed!=42 || value!=12) {return 1;}}
 return changed-42;
}
frame main() ret int {return check(7);}`,
      },
      {
        name: "deferred-alias-update-on-runtime-error",
        source: `
frame main() ret int {
 local count:int=0;local counter:*int=&count;
 try {defer {*counter+=1;}local q:*int=nullptr;*q=7;}
 catch(e:NullAccessError) {if(e.code==7)count+=10;}
 if(count!=11) {return 1;}return 0;
}`,
      },
      {
        name: "aggregate-aliases-and-nested-rethrow",
        source: `
struct State {value:int,}
frame update(state:*State,values:*int) {
 state.value=42;values[1]=7;throw 3;
}
frame main() ret int {
 local state:State=State {value:0};local values:int[2]=[0,0];
 local caught:int=0;
 try {
  try {update(&state,values);}
  catch(e:int) {caught=e;values[0]=2;throw 4;}
 } catch(e:int) {
  if(e!=4 || caught!=3 || state.value!=42 || values[0]!=2 || values[1]!=7) {return 1;}
 }
 return 0;
}`,
      },
      {
        name: "repeated-handler-in-loop",
        source: `
frame main() ret int {
 local total:int=0;
 loop(local i:int=0;i<5;i++) {
  try {total+=i;throw i;}
  catch(e:int) {total+=e;}
 }
 if(total!=20) {return 1;}return 0;
}`,
      },
      {
        name: "handler-in-deferred-function",
        source: `
frame run(result:*int) {
 defer {
  local changed:int=0;
  try {changed=9;throw 1;}catch(e:int) {*result=changed+e;}
 }
}
frame main() ret int {
 local result:int=0;run(&result);
 if(result!=10) {return 1;}return 0;
}`,
      },
    ].map((entry) => ({ ...entry, validateLlvm: true, expectedStdout: "" })),
  );
}, 120000);
