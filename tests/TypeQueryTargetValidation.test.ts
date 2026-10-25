import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

for (const [name, declarations, query, code] of [
  ["variable target", "", "match<value>(value)", "BPL_TYPE_NOT_FOUND"],
  [
    "function target",
    "frame get()ret int{return 7;}",
    "match<get>(value)",
    "BPL_TYPE_NOT_FOUND",
  ],
  [
    "missing generic arguments",
    "struct Box<T>{value:T,}",
    "match<Box>(value)",
    "BPL_GENERIC_ARITY_MISMATCH",
  ],
  [
    "unknown generic argument",
    "struct Box<T>{value:T,}",
    "match<Box<Missing>>(value)",
    "BPL_TYPE_NOT_FOUND",
  ],
  [
    "unknown is generic argument",
    "struct Box<T>{value:T,}",
    "value is Box<Missing>",
    "BPL_TYPE_NOT_FOUND",
  ],
  ["unknown tuple element", "", "value is (Missing,int)", "BPL_TYPE_NOT_FOUND"],
  [
    "unknown callback result",
    "",
    "value is Func<Missing>(int)",
    "BPL_TYPE_NOT_FOUND",
  ],
  [
    "unknown lambda parameter",
    "",
    "value is Lambda<int>(Missing)",
    "BPL_TYPE_NOT_FOUND",
  ],
] as const) {
  test(`type queries reject ${name}`, () => {
    const checker = new TypeChecker({ collectAllErrors: true });
    checker.checkProgram(
      new Parser(
        `${declarations}frame main(){local value:int=1;local result:bool=${query};result;}`,
        "type-query-target-validation.bpl",
      ).parse(),
    );
    expect(checker.getErrors().map((error) => error.code)).toEqual([code]);
  });
}
