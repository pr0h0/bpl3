import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

function errors(source: string) {
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(
    new Parser(source, "generic-argument-diagnostic.bpl").parse(),
  );
  return checker
    .getErrors()
    .filter((error) => !error.message.startsWith("Unused variable"));
}

test("missing explicit generic arguments report generic arity rather than value arity", () => {
  const found = errors(
    "frame identity<T>(value:T)ret T{return value;} frame main(){identity(1);}",
  );
  expect(found).toHaveLength(1);
  expect(found[0]?.code).toBe("BPL_GENERIC_ARITY_MISMATCH");
  expect(found[0]?.message).toContain("0 type arguments");
  expect(found[0]?.hint).toContain("not inferred");
});

test("generic overloads still distinguish wrong value arity", () => {
  const found = errors(
    "frame identity<T>(value:T)ret T{return value;} frame main(){identity();}",
  );
  expect(found[0]?.code).toBe("BPL_CALL_ARGUMENT_COUNT_MISMATCH");
});

test("a matching non-generic overload still wins without explicit types", () => {
  const found = errors(
    "frame identity<T>(value:T)ret T{return value;} frame identity(value:int)ret int{return value;} frame main(){identity(1);}",
  );
  expect(found).toEqual([]);
});
