import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

function errors(source: string) {
  const program = new Parser(
    source,
    "catch-types.bpl",
    lexWithGrammar(source, "catch-types.bpl"),
  ).parse();
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(program);
  return checker.getErrors();
}

for (const [declarations, type, code] of [
  ["", "NoSuchType", "BPL_TYPE_NOT_FOUND"],
  ["struct Box<T>{value:T,}", "Box<NoSuchType>", "BPL_TYPE_NOT_FOUND"],
  ["struct Box<T>{value:T,}", "Box<int,int>", "BPL_GENERIC_ARITY_MISMATCH"],
]) {
  test(`rejects invalid catch annotation ${type}`, () => {
    const diagnostics = errors(
      `${declarations} frame main(){try {} catch(error:${type}){error;}}`,
    );
    expect(diagnostics.some((error) => error.code === code)).toBe(true);
  });
}

test("preserves valid primitive, alias and generic catch annotations", () => {
  expect(
    errors(`
    type Number=int;
    struct Box<T>{value:T,}
    frame main(){
      try {} catch(value:int){value;}
      try {} catch(value:Number){value;}
      try {} catch(value:Box<int>){value;}
      try {} catch {}
    }
  `),
  ).toEqual([]);
});

test("invalid catch types do not expose catch bindings to later statements", () => {
  const diagnostics = errors(`frame main(){
    try {} catch(secret:NoSuchType){secret;}
    secret;
  }`);
  expect(diagnostics.map((error) => error.code)).toEqual([
    "BPL_TYPE_NOT_FOUND",
    "BPL_SYMBOL_NOT_FOUND",
  ]);
  expect(diagnostics[0]?.location?.file).toBe("catch-types.bpl");
});
