import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

function parse(source: string) {
  const file = "spec-generic-parameters.bpl";
  return new Parser(source, file, lexWithGrammar(source, file)).parse();
}

function errors(source: string) {
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(parse(source));
  return checker.getErrors();
}

for (const declaration of [
  "spec Broken<Element,Element>{}",
  "spec Broken<Element,Other,Element>{}",
  "spec Broken{frame get<Element,Element>() ret Element;}",
  "spec Broken<Outer>{frame get<Element,Other,Element>(value:Outer) ret Element;}",
]) {
  test(`rejects duplicate spec generic parameters: ${declaration}`, () => {
    expect(
      errors(`${declaration} frame main(){}`).some(
        (error) =>
          error.code === "BPL_SYMBOL_ALREADY_DEFINED" &&
          error.message === "Duplicate generic type parameter 'Element'",
      ),
    ).toBe(true);
  });
}

for (const declaration of [
  "spec Broken<Element,Element>{}",
  "spec Broken<Outer>{frame get<Element,Element>() ret Element;}",
]) {
  test(`fail-fast duplicate spec parameters restore scope: ${declaration}`, () => {
    const checker = new TypeChecker({ collectAllErrors: false });
    const scope = checker.currentScope;
    expect(() =>
      checker.checkStatement(parse(declaration).statements[0]!),
    ).toThrow("Duplicate generic type parameter 'Element'");
    expect(checker.currentScope === scope).toBe(true);
  });
}

test("spec parameter names are case sensitive and reusable in other declarations", () => {
  expect(
    errors(`
    spec First<Element,element>{frame get<Result>(value:Element) ret Result;frame other<Result>() ret Result;}
    spec Second<Element>{frame get<Element>(value:Element) ret Element;}
    frame main(){}
  `),
  ).toEqual([]);
});

test("duplicate spec parameters cannot leak after diagnostic recovery", () => {
  const messages = errors(
    `spec Broken<Outer>{frame get<Element,Element>() ret Element;} frame main(){local _outer:Outer;local _element:Element;}`,
  ).map((error) => error.message);
  expect(messages).toContain("Duplicate generic type parameter 'Element'");
  expect(messages).toContain("Undefined type 'Outer'");
  expect(messages).toContain("Undefined type 'Element'");
});
