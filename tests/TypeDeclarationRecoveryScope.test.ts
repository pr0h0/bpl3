import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

function parse(source: string) {
  const file = "type-declaration-recovery.bpl";
  return new Parser(source, file, lexWithGrammar(source, file)).parse();
}

for (const declaration of [
  "struct Broken<Element>{value:MissingType,}",
  "struct Broken<Element>{frame bad(this:*Broken<Element>,_value:MissingType){}}",
  "enum Broken<Element>{Value,frame bad(this:*Broken<Element>,_value:MissingType){}}",
]) {
  test(`a failed type declaration cannot expose generic parameters: ${declaration}`, () => {
    const checker = new TypeChecker({ collectAllErrors: true });
    checker.checkProgram(
      parse(`${declaration} frame main(){local _value:Element;}`),
    );
    const messages = checker.getErrors().map((error) => error.message);
    expect(messages).toContain("Undefined type 'MissingType'");
    expect(messages).toContain("Undefined type 'Element'");
  });
}

for (const [source, message] of [
  [
    "struct Broken<Element>{value:MissingType,}",
    "Undefined type 'MissingType'",
  ],
  ["enum Broken{}", "must have at least one variant"],
] as const) {
  test(`fail-fast type checking restores the incoming scope: ${source}`, () => {
    const checker = new TypeChecker({ collectAllErrors: false });
    const scope = checker.currentScope;
    expect(() => checker.checkStatement(parse(source).statements[0]!)).toThrow(
      message,
    );
    expect(checker.currentScope === scope).toBe(true);
  });
}

for (const source of [
  "struct Box<Element>{value:Element,}",
  "enum Choice<Element>{Value,None,}",
]) {
  test(`successful type checking restores the incoming scope: ${source}`, () => {
    const checker = new TypeChecker({ collectAllErrors: false });
    const scope = checker.currentScope;
    expect(() =>
      checker.checkStatement(parse(source).statements[0]!),
    ).not.toThrow();
    expect(checker.currentScope === scope).toBe(true);
  });
}
