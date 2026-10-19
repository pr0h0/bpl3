import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

function errors(source: string) {
  const file = "nonvoid-return-paths.bpl";
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(
    new Parser(source, file, lexWithGrammar(source, file)).parse(),
  );
  return checker.getErrors().map((error) => error.message);
}

for (const type of ["(int,bool)", "Func<int>()", "Lambda<int>()", "*void"]) {
  test(`requires complete returns for ${type}`, () => {
    expect(errors(`frame value() ret ${type}{} frame main(){}`)).toContain(
      "Function 'value' may not return a value on all code paths",
    );
  });
}

for (const type of ["(int,bool)", "Func<int>()", "Lambda<int>()", "*void"]) {
  test(`throwing satisfies the return requirement for ${type}`, () => {
    expect(
      errors(`frame value() ret ${type}{throw 1;} frame main(){}`),
    ).toEqual([]);
  });
}

test("an alias to void does not require a return value", () => {
  expect(
    errors("type Nothing=void; frame value() ret Nothing{} frame main(){}"),
  ).toEqual([]);
});

test("an alias to a compound value still requires a return", () => {
  expect(
    errors("type Pair=(int,bool); frame value() ret Pair{} frame main(){}"),
  ).toContain("Function 'value' may not return a value on all code paths");
});

test("invalid bodies retain their primary error without missing-return noise", () => {
  const messages = errors(
    "frame value() ret (int,bool){missing;} frame main(){}",
  );
  expect(messages.some((message) => message.includes("missing"))).toBe(true);
  expect(messages.some((message) => message.includes("may not return"))).toBe(
    false,
  );
});

test("complete compound and plain-void alias returns execute at O0 and O3", () => {
  expectCorrectnessSuite([
    {
      name: "complete-nonvoid-returns",
      source: `
        type Nothing=void;
        frame done() ret Nothing{}
        frame pair() ret (int,bool){return (7,true);}
        frame callback() ret int{return 9;}
        frame factory() ret Func<int>(){return callback;}
        frame pointer() ret *void{return nullptr;}
        frame main() ret int{
          done();
          local result:(int,bool)=pair();
          local action:Func<int>()=factory();
          if(result.0!=7 || !result.1 || action()!=9 || pointer()!=nullptr){return 1;}
          return 0;
        }
      `,
      expectedStdout: "",
    },
  ]);
}, 30000);
