import { expect, test } from "bun:test";
import { CodeGenerator } from "../compiler/backend/CodeGenerator";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const receiver of ["*Box", "Box"] as const) {
  test(`void index getter calls use the normal void-call ABI with ${receiver}`, () => {
    const source = `global calls:int=0;global observed:int=0;global keys:int=0;
   frame key()ret int{keys=keys+1;return 6;}
   struct Box{value:int,frame __get__(this:${receiver},index:int){calls=calls+1;observed=this.value+index;this.value=99;}}
   frame main()ret int{local box:Box=Box{value:1};box[key()];
    if(calls!=1 || keys!=1 || observed!=7 || box.value!=${receiver === "Box" ? 1 : 99})return 1;return 0;}`;
    const program = new Parser(source, "void-index-getter.bpl").parse();
    const checker = new TypeChecker({ collectAllErrors: true });
    checker.checkProgram(program);
    expect(checker.getErrors()).toEqual([]);
    const ir = new CodeGenerator().generate(program);
    expect(ir).not.toMatch(/=\s*call void @Box[^\s(]*___get__/);
    expectCorrectnessSuite([
      {
        name: receiver === "Box" ? "value-receiver" : "pointer-receiver",
        source,
        validateLlvm: true,
      },
    ]);
  }, 60000);
}

test("void index getter results cannot supply integer assignments", () => {
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(
    new Parser(
      `struct Box{frame __get__(this:*Box,index:int){index;}}
  frame main(){local box:Box=Box{};local result:int=0;result=box[0];result;}`,
      "void-getter-result.bpl",
    ).parse(),
  );
  expect(
    checker
      .getErrors()
      .some((error) => error.code === "BPL_ASSIGNMENT_TYPE_MISMATCH"),
  ).toBe(true);
});
