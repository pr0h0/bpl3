import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

function errors(source: string) {
  const file = "lambda-return-paths.bpl";
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(
    new Parser(source, file, lexWithGrammar(source, file)).parse(),
  );
  return checker.getErrors().map((error) => error.message);
}

for (const type of [
  "int",
  "(int,bool)",
  "Func<int>()",
  "Lambda<int>()",
  "*void",
]) {
  for (const expression of [`||ret ${type}{}`, "||{}"]) {
    test(`requires complete lambda returns: ${type} = ${expression}`, () => {
      expect(
        errors(`frame main(){local _value:Lambda<${type}>()=${expression};}`),
      ).toContain("Lambda may not return a value on all code paths");
    });
  }
}

test("a partially returning lambda is rejected", () => {
  expect(
    errors(
      "frame main(){local _value:Lambda<int>(bool)=|flag|ret int{if(flag){return 1;}};}",
    ),
  ).toContain("Lambda may not return a value on all code paths");
});

for (const expression of ["||{}", "||ret void{}", "||ret Nothing{}"]) {
  test(`void lambdas can fall through: ${expression}`, () => {
    expect(errors(`type Nothing=void; frame main(){${expression};}`)).toEqual(
      [],
    );
  });
}

test("throw-only and fully returning lambdas remain valid", () => {
  expect(
    errors(`frame main(){
    local _throwing:Lambda<int>()=||ret int{throw 1;};
    local _returning:Lambda<int>(bool)=|flag|ret int{if(flag){return 1;}else{return 2;}};
  }`),
  ).toEqual([]);
});

test("invalid lambda bodies keep their primary error without return noise", () => {
  const messages = errors(
    "frame main(){local _value:Lambda<int>()=||ret int{missing;};}",
  );
  expect(messages.some((message) => message.includes("missing"))).toBe(true);
  expect(messages.some((message) => message.includes("may not return"))).toBe(
    false,
  );
});

test("failed lambda return checking restores the enclosing scope", () => {
  const messages = errors(
    "frame main(){local _value:Lambda<int>(int)=|secret|ret int{};secret;}",
  );
  expect(messages).toContain("Lambda may not return a value on all code paths");
  expect(messages).toContain("Undefined symbol 'secret'");
});

test("complete contextual and compound lambdas execute at O0 and O3", () => {
  expectCorrectnessSuite([
    {
      name: "complete-lambda-returns",
      source: `
        type Nothing=void;
        frame main() ret int{
          local choose:Lambda<(int,bool)>(bool)=|flag|ret (int,bool){
            if(flag){return (3,true);}else{return (4,false);}
          };
          local pointer:Lambda<*void>()=||{return nullptr;};
          local done:Lambda<Nothing>()=||{};
          done();
          local result:(int,bool)=choose(true);
          if(result.0!=3 || !result.1 || pointer()!=nullptr){return 1;}
          return 0;
        }
      `,
      expectedStdout: "",
    },
  ]);
}, 30000);
