import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

function parse(source: string) {
  const file = "type-alias-known-types.bpl";
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
    test(`rejects unknown names in type aliases: ${type}`, () => {
      expect(
        errors(`type Broken=${type}; frame main(){}`).some(
          (error) =>
            error.code === "BPL_TYPE_NOT_FOUND" &&
            error.message === `Undefined type '${name}'`,
        ),
      ).toBe(true);
    });
  }
}

for (const source of [
  "global value:int=1;type Broken=value;frame main(){value;}",
  "frame value(){}type Broken=Func<value>();frame main(){}",
]) {
  test(`rejects value symbols in alias bodies: ${source}`, () => {
    expect(
      errors(source).some(
        (error) =>
          error.code === "BPL_TYPE_NOT_FOUND" &&
          error.message.includes("not a type"),
      ),
    ).toBe(true);
  });
}

for (const body of ["Element", "MissingType"]) {
  test(`alias validation cannot expose generic parameters: ${body}`, () => {
    const messages = errors(
      `type Alias<Element>=${body};frame main(){local _value:Element;}`,
    ).map((error) => error.message);
    expect(messages).toContain("Undefined type 'Element'");
    if (body === "MissingType")
      expect(messages).toContain("Undefined type 'MissingType'");
  });
}

test("fail-fast alias validation restores the incoming scope", () => {
  const checker = new TypeChecker({ collectAllErrors: false });
  const scope = checker.currentScope;
  expect(() =>
    checker.checkStatement(
      parse("type Alias<Element>=MissingType;").statements[0]!,
    ),
  ).toThrow("Undefined type 'MissingType'");
  expect(checker.currentScope === scope).toBe(true);
});

test("preserves declared alias parameters, forward aliases and short type names", () => {
  expect(
    errors(`
    type Forward=Number;
    type Number=int;
    type Callback<Element>=Func<Element>(Element);
    type Pair<T>=(T,bool);
    struct Box<Element>{value:Element,}
    type BoxAlias<Element>=Box<Element>;
    struct T{value:int,}
    type Record=T;
    frame main(){local _value:Record;local _pair:Pair<int>;local _callback:Callback<int>;}
  `),
  ).toEqual([]);
});

test("generic alias and compound alias consumers execute at O0 and O3", () => {
  expectCorrectnessSuite([
    {
      name: "known-alias-types",
      source: `
        type Number=int;
        type Pair<Element>=(Element,bool);
        type Callback<Element>=Func<Element>(Element);
        frame twice(value:int)ret int{return value*2;}
        frame main()ret int{
          local pair:Pair<Number>=(21,true);
          local action:Callback<Number>=twice;
          if(!pair.1 || action(pair.0)!=42){return 1;}
          return 0;
        }
      `,
      expectedStdout: "",
    },
  ]);
}, 30000);
