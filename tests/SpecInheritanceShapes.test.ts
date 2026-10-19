import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

function errors(source: string) {
  const file = "spec-inheritance-shapes.bpl";
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(
    new Parser(source, file, lexWithGrammar(source, file)).parse(),
  );
  return checker.getErrors();
}

for (const parent of [
  "(int,bool)",
  "(MissingType,int)",
  "Func<int>(int)",
  "Lambda<int>(int)",
  "Func<MissingType>(int)",
  "*Parent",
  "**Parent",
  "Parent[]",
  "Parent[2]",
]) {
  test(`rejects non-nominal spec inheritance: ${parent}`, () => {
    const diagnostics = errors(
      `spec Parent{} spec Child:${parent}{} frame main(){}`,
    );
    expect(diagnostics[0]?.message).toBe(
      "Spec inheritance requires a named spec type",
    );
  });
}

test("retains named, generic and multiple spec parents", () => {
  expect(
    errors(
      `spec Parent<Element>{} spec Other{} spec Child<Element>:Parent<Element>,Other{} frame main(){}`,
    ),
  ).toEqual([]);
});
