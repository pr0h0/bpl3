import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

function parse(source: string) {
  const file = "spec-signature-known-types.bpl";
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
    `Box<${name}>`,
  ]) {
    for (const signature of [
      `frame read(value:${type});`,
      `frame read() ret ${type};`,
    ]) {
      test(`rejects unknown spec signature types: ${signature}`, () => {
        expect(
          errors(
            `struct Box<Element>{value:Element,} spec Broken{${signature}} frame main(){}`,
          ).some(
            (error) =>
              error.code === "BPL_TYPE_NOT_FOUND" &&
              error.message === `Undefined type '${name}'`,
          ),
        ).toBe(true);
      });
    }
  }
}

test("preserves Self, declared spec and method parameters, and forward types", () => {
  expect(
    errors(`
    spec Container<Element>{
      frame get(this:*Self) ret Element;
      frame map<Result>(this:*Container<Element>, action:Func<Result>(Element)) ret Result;
      frame forward(value:*Later) ret (Element,bool);
    }
    struct Later{value:int,}
    frame main(){}
  `),
  ).toEqual([]);
});

for (const invalid of [false, true]) {
  test(`spec type parameters stay scoped after ${invalid ? "failed" : "successful"} validation`, () => {
    const diagnostics = errors(
      `spec Container<Element>{frame get() ret ${invalid ? "MissingType" : "Element"};} frame main(){local _value:Element;}`,
    ).map((error) => error.message);
    expect(diagnostics).toContain("Undefined type 'Element'");
    if (invalid) expect(diagnostics).toContain("Undefined type 'MissingType'");
  });
}

test("method type parameters do not escape into sibling signatures", () => {
  expect(
    errors(
      `spec Container{frame first<Element>(value:Element);frame second(value:Element);} frame main(){}`,
    ).map((error) => error.message),
  ).toContain("Undefined type 'Element'");
});

test("fail-fast spec validation restores the incoming scope", () => {
  const checker = new TypeChecker({ collectAllErrors: false });
  const scope = checker.currentScope;
  expect(() =>
    checker.checkStatement(
      parse("spec Container<Element>{frame get<Result>() ret MissingType;}")
        .statements[0]!,
    ),
  ).toThrow("Undefined type 'MissingType'");
  expect(checker.currentScope === scope).toBe(true);
});

for (const signature of [
  "frame read(value:Value);",
  "frame read() ret Func<Value>();",
]) {
  test(`rejects value symbols in spec signatures: ${signature}`, () => {
    expect(
      errors(
        `global Value:int=1; spec Broken{${signature}} frame main(){Value;}`,
      ).some(
        (error) =>
          error.code === "BPL_TYPE_NOT_FOUND" &&
          error.message.includes("not a type"),
      ),
    ).toBe(true);
  });
}

test("validated spec signatures retain native dispatch at O0 and O3", () => {
  expectCorrectnessSuite([
    {
      name: "validated-spec-signatures",
      source: `
      type Number=int;
      spec Value {frame get(this:*Self) ret Number;}
      spec Container<Element> {frame read(this:*Self) ret Element;}
      struct Box : Value, Container<int> {
        value:int,
        frame get(this:*Box) ret Number {return this.value;}
        frame read(this:*Box) ret int {return this.value;}
      }
      frame main() ret int {
        local box:Box=Box{value:42};
        local value:*Value=&box;
        if(value.get()!=42 || box.read()!=42){return 1;}
        return 0;
      }
    `,
      expectedStdout: "",
    },
  ]);
}, 30000);
