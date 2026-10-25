import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

function parse(source: string) {
  const file = "spec-inheritance-known-types.bpl";
  return new Parser(source, file, lexWithGrammar(source, file)).parse();
}

function errors(source: string) {
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(parse(source));
  return checker.getErrors();
}

for (const name of ["T", "MissingType"]) {
  for (const type of [
    name,
    `*${name}`,
    `(int,${name})`,
    `Func<${name}>(int)`,
    `Lambda<int>(${name})`,
  ]) {
    test(`rejects unknown inherited spec arguments: ${type}`, () => {
      expect(
        errors(
          `spec Parent<Element>{} spec Broken:Parent<${type}>{} frame main(){}`,
        ).some(
          (error) =>
            error.code === "BPL_TYPE_NOT_FOUND" &&
            error.message === `Undefined type '${name}'`,
        ),
      ).toBe(true);
    });
  }
}

test("keeps declared child parameters and forward types valid in inherited arguments", () => {
  expect(
    errors(
      `spec Parent<Element>{} spec Child<Element>:Parent<(Element,Later)>{} struct Later{value:int,} frame main(){}`,
    ),
  ).toEqual([]);
});

test("inherited arguments reject value symbols", () => {
  expect(
    errors(
      `global Value:int=1; spec Parent<Element>{} spec Broken:Parent<Value>{} frame main(){Value;}`,
    ).some(
      (error) =>
        error.code === "BPL_TYPE_NOT_FOUND" &&
        error.message.includes("not a type"),
    ),
  ).toBe(true);
});

test("fail-fast inheritance validation restores the incoming scope", () => {
  const checker = new TypeChecker({ collectAllErrors: false });
  checker.checkProgram(parse("spec Parent<Parameter>{} frame main(){}"));
  const scope = checker.currentScope;
  expect(() =>
    checker.checkStatement(
      parse("spec Child<Element>:Parent<MissingType>{}").statements[0]!,
    ),
  ).toThrow("Undefined type 'MissingType'");
  expect(checker.currentScope === scope).toBe(true);
});

test("failed inheritance validation cannot expose child parameters", () => {
  const messages = errors(
    `spec Parent<Element>{} spec Child<Element>:Parent<MissingType>{} frame main(){local _value:Element;}`,
  ).map((error) => error.message);
  expect(messages).toContain("Undefined type 'MissingType'");
  expect(messages).toContain("Undefined type 'Element'");
});

for (const [declaration, message] of [
  [
    "spec Child:MissingParent{}",
    "Undefined spec 'MissingParent' in inheritance list",
  ],
  ["struct Parent{} spec Child:Parent{}", "Type 'Parent' is not a spec"],
  ["spec Child:Child{}", "Spec 'Child' cannot extend itself"],
]) {
  test(`preserves inheritance diagnostics: ${message}`, () => {
    expect(
      errors(`${declaration} frame main(){}`).map((error) => error.message),
    ).toContain(message!);
  });
}

for (const [declaration, message] of [
  [
    "spec Child:MissingParent<MissingType>{}",
    "Undefined spec 'MissingParent' in inheritance list",
  ],
  [
    "struct Parent{} spec Child:Parent<MissingType>{}",
    "Type 'Parent' is not a spec",
  ],
  ["spec Child:Child<MissingType>{}", "Spec 'Child' cannot extend itself"],
]) {
  test(`validates parent names before generic arguments: ${declaration}`, () => {
    const diagnostics = errors(`${declaration} frame main(){}`);
    expect(diagnostics[0]?.message).toBe(message!);
    expect(diagnostics.map((error) => error.message)).not.toContain(
      "Undefined type 'MissingType'",
    );
  });
}
