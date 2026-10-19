import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

function messages(body: string) {
  const source = `frame main(){${body}}`;
  const filename = "destructuring-recovery.bpl";
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(
    new Parser(source, filename, lexWithGrammar(source, filename)).parse(),
  );
  return checker.getErrors().map((error) => error.message);
}

for (const body of [
  "local(left:int,right:bool)=missing;left;right;",
  "local(left:int,(right:bool,last:int))=missing;left;right;last;",
]) {
  test(`failed tuple initializer preserves declared bindings: ${body}`, () => {
    expect(messages(body)).toEqual(["Undefined symbol 'missing'"]);
  });
}

test("partially checked destructuring preserves remaining targets without unused noise", () => {
  const errors = messages("local(left:int,right:bool)=(1,2);right;");
  expect(errors).toHaveLength(1);
  expect(errors[0]).toContain("Type mismatch");
});

test("recovered tuple targets still use their declared types", () => {
  const errors = messages(
    "local(left:int,right:bool)=missing;left;local bad:(int,int)=right;bad;",
  );
  expect(errors).toHaveLength(2);
  expect(errors[0]).toBe("Undefined symbol 'missing'");
  expect(errors[1]).toContain("Type mismatch");
});

test("recovery preserves unrelated existing bindings", () => {
  expect(
    messages(
      "local value:int=1;local(value:bool,other:int)=missing;value+1;other;",
    ),
  ).toEqual(["Undefined symbol 'missing'"]);
});

test("recovery does not suppress unrelated unused-variable errors", () => {
  expect(
    messages("local value:int=1;local(value:bool,other:int)=missing;other;"),
  ).toEqual(["Undefined symbol 'missing'", "Unused variable 'value'"]);
});

test("unknown target types are not invented during recovery", () => {
  expect(
    messages("local(left:MissingType,right:int)=missing;left;right;"),
  ).toEqual(["Undefined symbol 'missing'", "Undefined symbol 'left'"]);
});
