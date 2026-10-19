import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

function errors(source: string) {
  const file = "enum-payload-types.bpl";
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(
    new Parser(source, file, lexWithGrammar(source, file)).parse(),
  );
  return checker.getErrors();
}

for (const name of ["T", "MissingType"]) {
  for (const type of [name, `Func<int>(${name})`]) {
    for (const payload of [`Value(${type})`, `Value{value:${type}}`]) {
      test(`rejects unknown enum payload types: ${payload}`, () => {
        expect(
          errors(`enum Broken{${payload},} frame main(){}`).some(
            (error) =>
              error.code === "BPL_TYPE_NOT_FOUND" &&
              error.message === `Undefined type '${name}'`,
          ),
        ).toBe(true);
      });
    }
  }
}

for (const payload of [
  "Value(Element,Func<Element>(Element),X1)",
  "Value{value:Element,callback:Func<Element>(Element),number:X1}",
]) {
  test(`preserves declared generic and alias enum payloads: ${payload}`, () => {
    expect(
      errors(
        `type X1=int; enum Choice<Element>{${payload},None,} frame main(){}`,
      ),
    ).toEqual([]);
  });
}
