import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const [name, expression] of [
  ["true conditional pointer", "(true?pointer(&values[0]):pointer(&other[0]))"],
  [
    "false conditional pointer",
    "(false?pointer(&other[0]):pointer(&values[0]))",
  ],
  [
    "matched pointer",
    "(match(false){true=>pointer(&other[0]),false=>pointer(&values[0]),})",
  ],
  ["cast pointer", "cast<*int>(pointer(&values[0]))"],
  ["address expression", "(&values[0])"],
  ["conditional slice", "(true?slice(values):slice(other))"],
  ["matched slice", "(match(false){true=>slice(other),false=>slice(values),})"],
  ["cast slice", "cast<int[]>(values)"],
] as const) {
  test(`writes through ${name} preserve caller storage`, () => {
    expectCorrectnessSuite([
      {
        name: name.replaceAll(" ", "-"),
        validateLlvm: true,
        source: `frame pointer(v:*int)ret *int{return v;}
      frame slice(v:int[])ret int[]{return v;}
      frame main()ret int{
        local values:int[2]=[1,2];local other:int[2]=[3,4];
        ${expression}[1]+=5;
        local p:*int=&${expression}[0];*p=9;
        if(values[0]!=9 || values[1]!=7)return 1;
        if(other[0]!=3 || other[1]!=4)return 2;
        return 0;
      }`,
      },
    ]);
  }, 60000);
}

test("conditional borrowed index base and index evaluate once in source order", () => {
  expectCorrectnessSuite([
    {
      name: "conditional-borrowed-index-order",
      validateLlvm: true,
      source: `global trace:int=0;
    frame choose()ret bool{trace=1;return false;}
    frame pointer(v:*int)ret *int{trace=trace*10+2;return v;}
    frame wrong(v:*int)ret *int{trace=99;return v;}
    frame index()ret int{trace=trace*10+3;return 1;}
    frame main()ret int{
      local values:int[2]=[1,2];
      (choose()?wrong(&values[0]):pointer(&values[0]))[index()]+=5;
      if(trace!=123 || values[1]!=7)return 1;return 0;
    }`,
    },
  ]);
}, 60000);

for (const [name, expression] of [
  ["conditional", "(true?[1,2]:[3,4])"],
  ["match", "(match(true){true=>[1,2],false=>[3,4],})"],
  ["cast", "cast<int[2]>([1,2])"],
] as const) {
  test(`owned ${name} array elements remain unwritable`, () => {
    const checker = new TypeChecker({ collectAllErrors: true });
    checker.checkProgram(
      new Parser(
        `frame main(){${expression}[0]=7;}`,
        "owned-index-base.bpl",
      ).parse(),
    );
    expect(
      checker
        .getErrors()
        .some((error) => error.code === "BPL_ASSIGNMENT_TARGET_INVALID"),
    ).toBe(true);
  });
}
