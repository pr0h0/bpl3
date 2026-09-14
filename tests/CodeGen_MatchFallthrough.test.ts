import { expect, test } from "bun:test";
import { compileToLLVM } from "./helpers";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("partial-return match arms fail clearly instead of emitting incomplete phi nodes", () => {
  for (const source of [
    `enum Choice {Some(int),None,} frame main() ret int {local v:Choice=Choice.Some(2);local n:int=match(v) {Choice.Some(x)=>{if(x>0) {return x;}},Choice.None=>{return 0;}};return n;}`,
    `frame main() ret int {local x:int=2;return match(x) {2=>{if(x>0) {return 1;}},_=>{return 0;}};}`,
    `frame main() ret int {local x:(int,int)=(1,2);return match(x) {(a,b)=>{if(a>b) {return a;}}};}`,
  ])
    expect(() => compileToLLVM(source)).toThrow(
      "Value-producing match arm can finish without returning a value",
    );
});
test("fully returning and void match arms remain valid", () => {
  expectCorrectnessSuite([
    {
      name: "complete-match-arms",
      validateLlvm: true,
      source: `extern printf(fmt:string,...) ret int;
frame choose(x:int) ret int {return match(x) {1=>{if(x>0) {return 8;}else{return 9;}},_=>{return 10;}};}
frame main() ret int {local x:int=0;match(1) {1=>{x=5;},_=>{x=9;}};if(x!=5 || choose(1)!=8 || choose(2)!=10) {return 1;}printf("match passed\\n");return 0;}`,
      expectedStdout: "match passed\n",
    },
  ]);
}, 60000);
