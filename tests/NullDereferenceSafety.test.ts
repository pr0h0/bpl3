import { test } from "bun:test";
import {
  expectCorrectnessSuite,
  expectRuntimeFailureSuite,
} from "./helpers/compilerCorrectness";

// Loads and lvalues must use the same checked dereference path.
// spec: R-ARR-10
test("explicit null indirection fails consistently at O0/O3", () => {
  expectRuntimeFailureSuite(
    [
      {
        name: "load",
        source: "frame main() ret int {local p:*int=nullptr;return *p;}",
      },
      {
        name: "store",
        source: "frame main() ret int {local p:*int=nullptr;*p=3;return 0;}",
      },
      {
        name: "compound",
        source: "frame main() ret int {local p:*int=nullptr;*p+=3;return 0;}",
      },
      {
        name: "increment",
        source: "frame main() ret int {local p:*int=nullptr;(*p)++;return 0;}",
      },
    ].map((value) => ({ ...value, expectedMessage: "NULL POINTER ACCESS" })),
  );
}, 120000);

test("checked indirection evaluates once and unwinds into typed catches", () => {
  expectCorrectnessSuite([
    {
      name: "null-dereference-catch",
      validateLlvm: true,
      expectedStdout: "",
      source: `
global calls:int=0;
global count:int=0;
frame pointer(p:*int) ret *int {calls+=1;return p;}
frame main() ret int {
 local value:int=3;local p:*int=&value;
 *pointer(p)=5;if(calls!=1 || value!=5) {return 1;}
 local counter:*int=&count;
 try {defer {*counter+=1;}local q:*int=nullptr;*q=7;}
 catch(e:NullAccessError) {if(e.code==7)count+=10;}
 if(count!=11) {return 2;}
 p=nullptr;
 try {local got:int=*p;if(got==0) {return 3;}}
 catch(e:NullAccessError) {if(e.code==7)count+=100;}
 if(count!=111) {return 4;}
 local pp:**int=&p;
 try {**pp=9;}catch(e:NullAccessError) {if(e.code==7)count+=1000;}
 if(count!=1111) {return 5;}
 p=&value;(*p)++;if(value!=6) {return 6;}return 0;
}`,
    },
  ]);
}, 60000);
