import { test } from "bun:test";
import {
  expectCleanFailureSuite,
  expectCorrectnessSuite,
} from "./helpers/compilerCorrectness";

test("try/catch return paths include typed catches, rethrows, cleanup, and match yields", () => {
  expectCorrectnessSuite([
    {
      name: "try-return-paths",
      validateLlvm: true,
      source: `import printf from "std/c.bpl";
global cleaned:int=0;
frame typed(fail:bool) ret int {
 try {defer {cleaned=cleaned+1;}if(fail) {throw 7;}return 3;}
 catch(error:int) {return error;}
}
frame all(fail:bool) ret int {
 try {if(fail) {throw "error";}return 11;}
 catch {return 13;}
}
frame nested() ret int {
 try {
  try {throw "outer";}catch(error:int) {return error;}
 }catch {return 17;}
}
frame rethrow() ret int {
 try {throw 19;}catch(error:int) {throw error+4;}
}
frame yielded(fail:bool) ret int {
 return match(fail) {
  true => {try {throw 29;}catch(error:int) {return error;}},
  false => {try {return 31;}catch {return 0;}},
 };
}
frame main() ret int {
 if(typed(false)!=3 || typed(true)!=7 || cleaned!=2) {return 1;}
 if(all(false)!=11 || all(true)!=13 || nested()!=17) {return 2;}
 local caught:int=0;try {caught=rethrow();}catch(error:int) {caught=error;}
 if(caught!=23 || yielded(true)!=29 || yielded(false)!=31) {return 3;}
 printf("return paths ok\\n");return 0;
}`,
      expectedStdout: "return paths ok\n",
    },
  ]);
}, 60000);

test("try/catch still rejects reachable function fallthrough", () => {
  expectCleanFailureSuite([
    {
      name: "try-falls-through",
      source: `frame value(flag:bool) ret int {
 try {if(flag) {return 1;}}catch {return 2;}
}
frame main() ret int {return value(false);}`,
      expectedMessage: "may not return a value on all code paths",
    },
    {
      name: "typed-catch-falls-through",
      source: `frame value() ret int {
 try {throw 3;}catch(error:int) {if(error==1) {return 2;}}catch {return 3;}
}
frame main() ret int {return value();}`,
      expectedMessage: "may not return a value on all code paths",
    },
    {
      name: "nested-catch-falls-through",
      source: `frame value(flag:bool) ret int {
 try {return 1;}catch {
  try {return 2;}catch {if(flag) {return 3;}}
 }
}
frame main() ret int {return value(false);}`,
      expectedMessage: "may not return a value on all code paths",
    },
    {
      name: "try-match-arm-falls-through",
      source: `frame value(flag:bool) ret int {
 return match(flag) {
  true => {try {if(flag) {return 1;}}catch {return 2;}},
  false => 3,
 };
}
frame main() ret int {return value(false);}`,
      expectedMessage:
        "Value-producing match arm can finish without returning a value",
    },
  ]);
}, 30000);
