import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("unsigned matches retain fitting literals across arms and every block yield at O0/O3", () => {
  expectCorrectnessSuite([
    {
      name: "match-fitting-literals",
      validateLlvm: true,
      source: `frame left(v:u64,flag:bool)ret u64{return match(flag){true=>v,false=>0,};}
frame right(v:u64,flag:bool)ret u64{return match(flag){true=>0,false=>v,};}
frame block(v:u64,flag:bool)ret u64{return match(1){1=>{if(flag){return v;}return 0;},_=>{if(flag){return 1;}return 0;},};}
frame tuple(v:u64,flag:bool)ret (u64,int){return match(flag){true=>(v,1),false=>(0,2),};}
frame main()ret int{local v:u64=cast<u64>(18446744073709551615);local pair:(u64,int)=tuple(v,true);local zero:(u64,int)=tuple(v,false);
 if(left(v,true)!=v||left(v,false)!=cast<u64>(0)||right(v,false)!=v||right(v,true)!=cast<u64>(0)||block(v,true)!=v||block(v,false)!=cast<u64>(0)||pair.0!=v||zero.0!=cast<u64>(0)){return 1;}return 0;}`,
      expectedStdout: "",
    },
  ]);
}, 60000);

for (const expression of [
  "match(flag){true=>0,false=>{if(flag){return n;}return v;},}",
  "match(1){1=>{if(flag){return 0;}if(n<0){return n;}return v;},_=>0,}",
  "match(flag){true=>(0,1),false=>{if(flag){return(n,2);}return(v,3);},}",
]) {
  test(`integer match literal checks retain all previous runtime values: ${expression}`, () => {
    const result = expression.includes("(0,1)") ? "(u64,int)" : "u64";
    const source = `frame bad(flag:bool,n:int,v:u64)ret ${result}{return ${expression};}`;
    const checker = new TypeChecker({ collectAllErrors: true });
    checker.checkProgram(new Parser(source, "match-literals.bpl").parse());
    expect(
      checker
        .getErrors()
        .some((error) =>
          /Match (arms|block yields) must have compatible types/.test(
            error.message,
          ),
        ),
    ).toBe(true);
  });
}
