import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

function errors(source: string) {
  const file = "lambda-signature-alias-shadowing.bpl";
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(
    new Parser(source, file, lexWithGrammar(source, file)).parse(),
  );
  return checker.getErrors().map((error) => error.message);
}

for (const source of [
  "type Number=int; frame main(){local _work:Lambda<int>(int,Number)=|Number:int,other:Number|ret int{return Number+other;};}",
  "type Number=int; frame main(){local _work:Lambda<int>(int)=|Number:int|ret Number{return Number;};}",
  "type Number=int; frame main(){local _work:Lambda<int>(int,Number)=|Number:int,other|ret Number{return Number+other;};}",
  "type Nothing=void; frame main(){local _work:Lambda<void>(int)=|Nothing:int|ret Nothing{Nothing;};}",
  "type Callback=Func<int>(); frame main(){local _work:Lambda<int>(int,Callback)=|Callback:int,action:Callback|ret int{Callback;return action();};}",
  "type Pair=(int,bool); frame main(){local _work:Lambda<int>(int,Pair)=|Pair:int,other:Pair|ret int{Pair;return other.0;};}",
]) {
  test(`lambda signatures bind aliases before value parameters: ${source}`, () => {
    expect(errors(source)).toEqual([]);
  });
}

test("lambda signature alias shadowing executes at O0 and O3", () => {
  expectCorrectnessSuite([
    {
      name: "lambda-signature-alias-shadowing",
      source: `
        type Number=int;
        type Nothing=void;
        frame main()ret int{
          local add:Lambda<int>(int,int)=|Number:int,other:Number|ret Number{
            return Number+other;
          };
          local done:Lambda<void>(int)=|Nothing:int|ret Nothing{Nothing;};
          done(1);
          if(add(20,22)!=42){return 1;}
          return 0;
        }
      `,
      expectedStdout: "",
    },
  ]);
}, 30000);
