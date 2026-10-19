import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

function parse(source: string) {
  const file = "alias-generic-parameters.bpl";
  return new Parser(source, file, lexWithGrammar(source, file)).parse();
}

for (const source of [
  "type Pair<T,T>=(T,T);",
  "type Callback<Element,Element>=Func<Element>(Element);",
  "type Triple<A,B,A>=(A,B,A);",
]) {
  test(`duplicate alias parameters are rejected: ${source}`, () => {
    const checker = new TypeChecker({ collectAllErrors: true });
    checker.checkProgram(parse(`${source} frame main(){}`));
    expect(
      checker
        .getErrors()
        .some(
          (error) =>
            error.code === "BPL_SYMBOL_ALREADY_DEFINED" &&
            error.message.startsWith("Duplicate generic type parameter"),
        ),
    ).toBe(true);
  });
}

test("duplicate alias parameters cannot leak into following declarations", () => {
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(
    parse(
      "type Broken<Element,Element>=Element;frame main(){local _value:Element;}",
    ),
  );
  const messages = checker.getErrors().map((error) => error.message);
  expect(messages).toContain("Duplicate generic type parameter 'Element'");
  expect(messages).toContain("Undefined type 'Element'");
});

test("fail-fast duplicate alias checking restores the incoming scope", () => {
  const checker = new TypeChecker({ collectAllErrors: false });
  const scope = checker.currentScope;
  expect(() =>
    checker.checkStatement(
      parse("type Broken<Element,Element>=Element;").statements[0]!,
    ),
  ).toThrow("Duplicate generic type parameter 'Element'");
  expect(checker.currentScope === scope).toBe(true);
});

test("distinct alias parameters and reuse in other aliases remain valid", () => {
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(
    parse(
      "type Pair<T,t>=(T,t);type Identity<T>=T;frame main(){local _pair:Pair<int,bool>;local _value:Identity<int>;}",
    ),
  );
  expect(checker.getErrors()).toEqual([]);
});
