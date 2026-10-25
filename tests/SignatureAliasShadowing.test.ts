import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

function errors(source: string) {
  const file = "signature-alias-shadowing.bpl";
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(
    new Parser(source, file, lexWithGrammar(source, file)).parse(),
  );
  return checker.getErrors().map((error) => error.message);
}

for (const source of [
  "type Number=int; frame value(Number:int,other:Number)ret int{return Number+other;}",
  "type Number=int; frame value(Number:int)ret Number{return Number;}",
  "type Nothing=void; frame value(Nothing:int)ret Nothing{Nothing;return;}",
  "type Callback=Func<int>(); frame value(Callback:int,action:Callback)ret int{Callback;return action();}",
  "type Pair=(int,bool); frame value(Pair:int,other:Pair)ret int{Pair;return other.0;}",
]) {
  test(`named signatures bind aliases before value parameters: ${source}`, () => {
    expect(errors(`${source} frame main(){}`)).toEqual([]);
  });
}

test("named signature alias shadowing executes at O0 and O3", () => {
  expectCorrectnessSuite([
    {
      name: "named-signature-alias-shadowing",
      source: `
        type Number=int;
        type Nothing=void;
        frame add(Number:int,other:Number)ret Number{return Number+other;}
        frame done(Nothing:int)ret Nothing{Nothing;return;}
        frame main()ret int{
          done(1);
          if(add(20,22)!=42){return 1;}
          return 0;
        }
      `,
      expectedStdout: "",
    },
  ]);
}, 30000);
