import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

/** Provide exported types and a separate same-named struct for nominal comparisons. */
function withModules(run: (declarations: string, file: string) => void) {
  const root = mkdtempSync(join(tmpdir(), "bpl-qualified-type-query-"));
  try {
    const module = join(root, "types.bpl");
    const other = join(root, "other.bpl");
    writeFileSync(
      module,
      "struct Record{value:int,}type Number=int;type Pair=(int,bool);enum Color{Red,Blue,}struct Box<T>{value:T,}export Box;export Record;export Number;export Pair;export Color;",
    );
    writeFileSync(other, "struct Record{value:int,}export Record;");
    run(
      `import * as types from ${JSON.stringify(module)};import [Box] from ${JSON.stringify(module)};import * as other from ${JSON.stringify(other)};`,
      join(root, "main.bpl"),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
for (const [name, setup, target] of [
  ["struct", "local value:types.Record=types.Record{value:7};", "types.Record"],
  ["primitive alias", "local value:int=7;", "types.Number"],
  ["tuple alias", "local value:(int,bool)=(7,true);", "types.Pair"],
  ["enum type", "local value:types.Color=types.Color.Red;", "types.Color"],
  [
    "generic struct",
    "local value:types.Box<int>=Box<int>{value:7};",
    "types.Box<int>",
  ],
] as const) {
  for (const syntax of ["match", "is"] as const) {
    test(`${syntax} resolves qualified ${name} targets`, () =>
      withModules((imports, file) => {
        const query =
          syntax === "match" ? `match<${target}>(value)` : `value is ${target}`;
        const checker = new TypeChecker({ collectAllErrors: true });
        checker.checkProgram(
          new Parser(
            `${imports}frame main(){${setup}local result:bool=${query};result;}`,
            file,
          ).parse(),
        );
        expect(checker.getErrors()).toEqual([]);
      }));
  }
}

test(
  "qualified types preserve exact matching and module identity at O0/O3",
  () =>
    withModules((imports) => {
      expectCorrectnessSuite([
        {
          name: "qualified-type-query",
          validateLlvm: true,
          source: `${imports}frame main()ret int{
      local value:types.Record=types.Record{value:7};
      if(!match<types.Record>(value)||!(value is types.Record))return 1;
      if(match<other.Record>(value)||value is other.Record)return 2;
      local number:int=7;if(!match<types.Number>(number)||!(number is types.Number))return 3;
      local pair:(int,bool)=(7,true);if(!match<types.Pair>(pair)||!(pair is types.Pair))return 4;
      local color:types.Color=types.Color.Red;if(!match<types.Color>(color)||!(color is types.Color))return 5;
      local box:types.Box<int>=Box<int>{value:7};
      if(!match<types.Box<int>>(box)||!(box is types.Box<int>))return 6;
      return 0;
    }`,
        },
      ]);
    }),
  60000,
);

test(
  "qualified enum variant queries retain their existing tag checks",
  () =>
    withModules((imports) => {
      expectCorrectnessSuite([
        {
          name: "qualified-enum-query-control",
          validateLlvm: true,
          source: `${imports}frame main()ret int{
      local color:types.Color=types.Color.Red;
      if(!match<types.Color.Red>(color)||match<types.Color.Blue>(color))return 1;
      if(!(color is types.Color.Red)||color is types.Color.Blue)return 2;
      return 0;
    }`,
        },
      ]);
    }),
  60000,
);

for (const [name, target, code] of [
  ["missing export", "types.Hidden", "BPL_TYPE_QUERY_ENUM_NOT_FOUND"],
  ["generic arity", "types.Box", "BPL_GENERIC_ARITY_MISMATCH"],
] as const) {
  test(`qualified queries reject ${name}`, () =>
    withModules((imports, file) => {
      const checker = new TypeChecker({ collectAllErrors: true });
      checker.checkProgram(
        new Parser(
          `${imports}struct Hidden{value:int,}frame main(){local value:int=1;local result:bool=match<${target}>(value);result;}`,
          file,
        ).parse(),
      );
      expect(checker.getErrors().map((error) => error.code)).toEqual([code]);
    }));
}
