import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

for (const syntax of ["match", "is"] as const) {
  for (const target of [
    "Color.Red<int>",
    "Color.Red<Missing>",
    "Color.Red[0]",
    "Color.Red[2]",
    "Color.Red[]",
    "*Color.Red",
  ]) {
    test(`${syntax} rejects unsupported variant target ${target}`, () => {
      const query =
        syntax === "match" ? `match<${target}>(value)` : `value is ${target}`;
      const checker = new TypeChecker({ collectAllErrors: true });
      checker.checkProgram(
        new Parser(
          `enum Color{Red,Blue,}frame main(){local value:Color=Color.Red;local ok:bool=${query};ok;}`,
          "enum-query-modifiers.bpl",
        ).parse(),
      );
      expect(checker.getErrors().map((error) => error.code)).toEqual([
        "BPL_TYPE_QUERY_TYPE_NOT_FOUND",
      ]);
      expect(checker.getErrors()[0]?.message).toContain("modifiers");
    });
  }
  for (const generic of [false, true]) {
    test(`${syntax} preserves plain variant queries for ${generic ? "generic" : "ordinary"} enums`, () => {
      const query =
        syntax === "match" ? "match<Color.Red>(value)" : "value is Color.Red";
      const checker = new TypeChecker({ collectAllErrors: true });
      checker.checkProgram(
        new Parser(
          `enum Color${generic ? "<T>" : ""}{Red,Blue,}frame main(){local value:Color${generic ? "<int>" : ""}=Color${generic ? "<int>" : ""}.Red;local ok:bool=${query};ok;}`,
          "enum-query-modifier-controls.bpl",
        ).parse(),
      );
      expect(checker.getErrors()).toEqual([]);
    });
  }
}
