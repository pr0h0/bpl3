import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

function errors(body: string, lambda: boolean) {
  const file = "diverging-return-paths.bpl";
  const source = lambda
    ? `frame main(){local _work:Lambda<int>(bool)=|flag|ret int{flag;${body}};}`
    : `frame value(flag:bool)ret int{flag;${body}} frame main(){}`;
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(
    new Parser(source, file, lexWithGrammar(source, file)).parse(),
  );
  return checker.getErrors().map((error) => error.message);
}

for (const lambda of [false, true]) {
  for (const body of [
    "loop{}",
    "loop(true){}",
    "loop{continue;}",
    "loop{loop{break;}}",
    "loop{switch(1){default:{break;}}}",
    "if(flag){return 1;}else{loop{}}",
  ]) {
    test(`divergence satisfies return completeness (lambda=${lambda}): ${body}`, () => {
      expect(errors(body, lambda)).toEqual([]);
    });
  }
  for (const body of [
    "loop{break;}",
    "loop{if(flag){break;}}",
    "loop(flag){}",
    "loop(false){}",
    "loop{try{break;}catch{continue;}}",
  ]) {
    test(`a reachable loop exit still requires a return (lambda=${lambda}): ${body}`, () => {
      expect(
        errors(body, lambda).some((message) =>
          message.includes("may not return"),
        ),
      ).toBe(true);
    });
  }
}

test("returning branches inside unconditional loops execute at O0 and O3", () => {
  expectCorrectnessSuite([
    {
      name: "loop-return-paths",
      source: `
        frame value(flag:bool)ret int{
          loop{loop{break;}if(flag){return 7;}}
        }
        frame main()ret int{
          local work:Lambda<int>()=||ret int{loop{return 11;}};
          if(value(true)!=7 || work()!=11){return 1;}
          return 0;
        }
      `,
      expectedStdout: "",
    },
  ]);
}, 30000);
