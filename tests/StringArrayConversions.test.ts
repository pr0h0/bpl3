import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

/** Check conversions without executing rejected scalar or constant-view inputs. */
function diagnostics(source: string) {
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(
    new Parser(source, "string-array-conversions.bpl").parse(),
  );
  return checker.getErrors().map((error) => error.code);
}
for (const syntax of ["cast", "as"] as const) {
  const convert = (target: string) =>
    syntax === "cast" ? `cast<${target}>(bytes)` : `(bytes as ${target})`;
  for (const target of ["string", "Text"]) {
    test(`${syntax} accepts byte array to ${target}`, () => {
      expect(
        diagnostics(
          `type Text=string;frame main(){local bytes:char[3]=[97,98,0];local text:${target}=${convert(target)};text;}`,
        ),
      ).toEqual([]);
    });
  }
  test(`${syntax} still rejects mutable string views of constant arrays`, () => {
    expect(
      diagnostics(
        `type Text=string;frame main(){local const bytes:char[3]=[97,98,0];local text:Text=${convert("Text")};text;}`,
      ),
    ).toEqual(["BPL_CAST_INVALID"]);
  });
  test(`${syntax} still rejects scalar integers to string aliases`, () => {
    expect(
      diagnostics(
        `type Text=string;frame main(){local bytes:int=97;local text:Text=${convert("Text")};text;}`,
      ),
    ).toEqual(["BPL_CAST_INTEGER_TO_STRING"]);
  });
}
test("byte array string views preserve shared storage at O0/O3", () => {
  expectCorrectnessSuite([
    {
      name: "string-array-views",
      validateLlvm: true,
      source: `type Text=string;frame main()ret int{
      local bytes:char[3]=[97,98,0];
      local direct:string=cast<string>(bytes);local aliased:Text=cast<Text>(bytes);
      local other:string=bytes as string;local aliasOther:Text=bytes as Text;
      if(direct[0]!='a'||aliased[1]!='b'||other[0]!='a'||aliasOther[1]!='b')return 1;
      bytes[0]='c';if(direct[0]!='c'||aliased[0]!='c'||other[0]!='c'||aliasOther[0]!='c')return 2;
      return 0;
    }`,
    },
  ]);
}, 60000);
