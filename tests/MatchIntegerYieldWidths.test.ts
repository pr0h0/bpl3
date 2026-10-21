import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const [name, body, expected] of [
  [
    "block",
    "match(true){true=>{if(flag){return cast<u8>(1);}return 256;},false=>3,}",
    256,
  ],
  ["arms", "match(flag){true=>cast<u8>(1),false=>256,}", 256],
  [
    "enum",
    "match(flag?Choice.A:Choice.B){Choice.A=>cast<u8>(1),Choice.B=>256,}",
    256,
  ],
  ["tuple-pattern", "match((flag,1)){(true,_)=>cast<u8>(1),_=>256,}", 256],
  [
    "mixed",
    "match(flag){true=>cast<u8>(1),false=>{if(flag){return cast<u8>(2);}return 256;},}",
    256,
  ],
  [
    "signed",
    "match(true){true=>{if(flag){return cast<u8>(1);}return cast<i16>(-1);},false=>3,}",
    -1,
  ],
] as const) {
  test(`match integer yields preserve values: ${name} at O0/O3`, () => {
    expectCorrectnessSuite([
      {
        name: `match-widths-${name}`,
        validateLlvm: true,
        source: `enum Choice{A,B,}frame choose(flag:bool)ret int{return ${body};}frame main()ret int{if(choose(false)!=${expected}||choose(true)!=1){return 1;}return 0;}`,
        expectedStdout: "",
      },
    ]);
  }, 60000);
}

test("tuple match yields widen member types before returning at O0/O3", () => {
  expectCorrectnessSuite([
    {
      name: "match-widths-tuples",
      validateLlvm: true,
      source: `frame choose(flag:bool)ret (int,int){return match(true){true=>{if(flag){return (cast<u8>(1),2);}return (256,3);},false=>(4,5),};}
frame main()ret int{local a:(int,int)=choose(false);local b:(int,int)=choose(true);if(a.0!=256||b.0!=1){return 1;}return 0;}`,
      expectedStdout: "",
    },
  ]);
}, 60000);

for (const body of [
  "match(flag){true=>cast<i64>(-1),false=>cast<u64>(1),}",
  "match(true){true=>{if(flag){return cast<i64>(-1);}return cast<u64>(1);},false=>cast<i64>(2),}",
]) {
  test(`match rejects integer yields with no lossless retained representation: ${body}`, () => {
    const source = `frame choose(flag:bool)ret i64{return ${body};}frame main(){choose(false);}`;
    const checker = new TypeChecker({ collectAllErrors: true });
    checker.checkProgram(new Parser(source, "match-widths.bpl").parse());
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
