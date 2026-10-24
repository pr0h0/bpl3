import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

for (const target of [
  "(int,bool)[0]",
  "Func<int>(int)[0]",
  "Lambda<int>(int)[0]",
  "int[0]",
]) {
  for (const syntax of ["match", "is"] as const) {
    test(`${syntax} rejects a zero-sized ${target} query target`, () => {
      const query =
        syntax === "match" ? `match<${target}>(value)` : `value is ${target}`;
      const checker = new TypeChecker({ collectAllErrors: true });
      checker.checkProgram(
        new Parser(
          `frame main(){local value:int=1;local result:bool=${query};result;}`,
          "composite-query-array-size.bpl",
        ).parse(),
      );
      expect(checker.getErrors().map((error) => error.code)).toEqual([
        "BPL_ARRAY_SIZE_INVALID",
      ]);
    });
  }
}

for (const target of [
  "(int,bool)[2]",
  "(int,bool)[]",
  "Func<int>(int)[2]",
  "Func<int>(int)[]",
  "Lambda<int>(int)[2]",
  "Lambda<int>(int)[]",
]) {
  test(`composite query sizes preserve valid ${target} targets`, () => {
    const checker = new TypeChecker({ collectAllErrors: true });
    checker.checkProgram(
      new Parser(
        `frame main(){local value:int=1;local first:bool=match<${target}>(value);local second:bool=value is ${target};first;second;}`,
        "valid-composite-query-size.bpl",
      ).parse(),
    );
    expect(checker.getErrors()).toEqual([]);
  });
}
