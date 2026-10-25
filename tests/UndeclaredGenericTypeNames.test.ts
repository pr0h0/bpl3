import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

function errors(source: string) {
  const file = "undeclared-generic-names.bpl";
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(
    new Parser(source, file, lexWithGrammar(source, file)).parse(),
  );
  return checker.getErrors();
}

for (const name of ["T", "A", "X1"]) {
  for (const source of [
    `frame main(){local _value:${name};}`,
    `struct Holder{value:${name},} frame main(){}`,
    `frame main(){try {} catch(error:${name}){error;}}`,
    `frame main(){local _callback:Func<int>(${name});}`,
    `struct Box<Element>{value:Element,} frame main(){local _box:Box<${name}>;}`,
  ]) {
    test(`requires a declaration for generic-looking type ${name}: ${source}`, () => {
      expect(
        errors(source).some(
          (error) =>
            error.code === "BPL_TYPE_NOT_FOUND" &&
            error.message === `Undefined type '${name}'`,
        ),
      ).toBe(true);
    });
  }
}

test("preserves real short type names and declared generic parameters", () => {
  expect(
    errors(`
    struct T{value:int,}
    type X1=int;
    frame identity<Element>(value:Element) ret Element {
      local copy:Element=value;
      return copy;
    }
    frame localTypes<A>(value:A) ret A {
      local copy:A=value;
      local _callback:Func<A>(A);
      return copy;
    }
    frame main(){local _record:T;local _number:X1;}
  `),
  ).toEqual([]);
});
