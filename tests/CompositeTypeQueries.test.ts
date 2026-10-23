import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const [name, declarations, setup, target] of [
  ["tuple", "", "local value:(int,int)=(1,2);", "(int,int)"],
  [
    "nested tuple",
    "",
    "local value:((int,bool),int)=((1,true),2);",
    "((int,bool),int)",
  ],
  [
    "function",
    "frame identity(value:int)ret int{return value;}",
    "local value:Func<int>(int)=identity;",
    "Func<int>(int)",
  ],
  [
    "lambda",
    "",
    "local value:Lambda<int>(int)=|number:int| ret int {return number;};",
    "Lambda<int>(int)",
  ],
] as const) {
  for (const syntax of ["match", "is"] as const) {
    const query =
      syntax === "match" ? `match<${target}>(value)` : `value is ${target}`;
    test(`${syntax} accepts a ${name} target without internal errors`, () => {
      const checker = new TypeChecker({ collectAllErrors: true });
      checker.checkProgram(
        new Parser(
          `${declarations}frame main(){${setup}local result:bool=${query};result;}`,
          "composite-type-query.bpl",
        ).parse(),
      );
      expect(checker.getErrors()).toEqual([]);
    });
  }
}

test("composite query targets preserve exact type comparisons at O0/O3", () => {
  expectCorrectnessSuite([
    {
      name: "composite-type-query",
      validateLlvm: true,
      source: `frame identity(value:int)ret int{return value;}
    frame same<T>(value:(T,T))ret bool{return match<(T,T)>(value);}
    frame main()ret int{
      local pair:(int,bool)=(7,true);
      if(!match<(int,bool)>(pair)||!(pair is (int,bool)))return 1;
      if(match<(int,int)>(pair)||pair is (int,int))return 2;
      local callback:Func<int>(int)=identity;
      if(!match<Func<int>(int)>(callback)||!(callback is Func<int>(int)))return 3;
      if(match<Func<int>(bool)>(callback))return 4;
      local action:Lambda<int>(int)=|number:int| ret int {return number;};
      if(!match<Lambda<int>(int)>(action)||!(action is Lambda<int>(int)))return 5;
      if(match<Lambda<int>(bool)>(action)||match<Func<int>(int)>(action))return 6;
      if(!same<int>((1,2)))return 7;
      local nested:((int,bool),int)=(pair,8);
      if(!match<((int,bool),int)>(nested))return 8;
      return 0;
    }`,
    },
  ]);
}, 60000);
