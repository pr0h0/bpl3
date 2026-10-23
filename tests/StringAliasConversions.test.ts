import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

function diagnostics(source: string) {
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(
    new Parser(source, "string-alias-conversions.bpl").parse(),
  );
  return checker.getErrors();
}

for (const syntax of ["cast", "as"] as const) {
  const convert = (type: string, value: string) =>
    syntax === "cast" ? `cast<${type}>(${value})` : `(${value} as ${type})`;
  for (const [name, aliases, value] of [
    ["direct", "type Text=string;", "7"],
    ["transitive", "type Root=string;type Text=Root;", "-7"],
    ["generic", "type Identity<T>=T;type Text=Identity<string>;", "7"],
    ["integer source alias", "type Number=int;type Text=string;", "number"],
  ] as const) {
    test(`${syntax} rejects integer to string through ${name} alias`, () => {
      const source = `${aliases}frame main(){local number:${name === "integer source alias" ? "Number" : "int"}=7;number;local value:Text=${convert("Text", value)};value;}`;
      const errors = diagnostics(source);
      expect(
        errors.filter((error) => error.code !== "BPL_CAST_INTEGER_TO_STRING"),
      ).toEqual([]);
      expect(
        errors.some((error) => error.code === "BPL_CAST_INTEGER_TO_STRING"),
      ).toBe(true);
    });
  }
  test(`${syntax} retains direct string rejection`, () => {
    expect(
      diagnostics(
        `frame main(){local value:string=${convert("string", "7")};value;}`,
      ).map((error) => error.code),
    ).toEqual(["BPL_CAST_INTEGER_TO_STRING"]);
  });
  test(`${syntax} preserves numeric, pointer and string identity conversions`, () => {
    expect(
      diagnostics(`type Number=int;type Text=string;type Pointer=*char;type Address=*string;
      frame main(){local value:Number=${convert("Number", "7")};value;
      local pointer:Pointer=${convert("Pointer", "0")};pointer;
      local address:Address=${convert("Address", "0")};address;
      local text:Text=${convert("Text", '"abc"')};text;
      }`),
    ).toEqual([]);
  });
}
