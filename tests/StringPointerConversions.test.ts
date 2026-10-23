import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

/** Collect conversion diagnostics without dereferencing converted pointer values. */
function diagnostics(source: string) {
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(
    new Parser(source, "string-pointer-conversions.bpl").parse(),
  );
  return checker.getErrors().map((error) => error.code);
}
for (const syntax of ["cast", "as"] as const) {
  const convert = (target: string) =>
    syntax === "cast" ? `cast<${target}>(0)` : `(0 as ${target})`;
  test(`${syntax} accepts a direct pointer-to-string target`, () => {
    expect(
      diagnostics(
        `frame main(){local pointer:*string=${convert("*string")};pointer;}`,
      ),
    ).toEqual([]);
  });
  test(`${syntax} retains equivalent pointer alias conversions`, () => {
    expect(
      diagnostics(
        `type Address=*string;frame main(){local pointer:Address=${convert("Address")};pointer;}`,
      ),
    ).toEqual([]);
  });
  test(`${syntax} diagnoses integer-to-string-array layout as an invalid cast`, () => {
    expect(
      diagnostics(
        `frame main(){local values:string[2]=${convert("string[2]")};values;}`,
      ),
    ).toEqual(["BPL_CAST_INVALID"]);
  });
}
