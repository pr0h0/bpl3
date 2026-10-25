import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

for (const later of ["return;", "return [3,4,5];", 'return "wrong";']) {
  test(`match block checks every yielded type: ${later}`, () => {
    const source = `frame main(){local values:int[2]=match(true){true=>{if(true){return [1,2];}${later}},false=>[3,4],};values;}`;
    const checker = new TypeChecker({ collectAllErrors: true });
    checker.checkProgram(new Parser(source, "match-block-types.bpl").parse());
    expect(checker.getErrors().length).toBeGreaterThan(0);
  });
}

test("compatible match block yields retain scalar widening at O0/O3", () => {
  expectCorrectnessSuite([
    {
      name: "match-block-compatible-yields",
      validateLlvm: true,
      source: `frame choose(flag:bool)ret int{return match(1){1=>{if(flag){return 1;}local value:u8=2;return value;},_=>3,};}
frame main()ret int{if(choose(true)!=1 || choose(false)!=2){return 1;}return 0;}`,
      expectedStdout: "",
    },
  ]);
}, 60000);
