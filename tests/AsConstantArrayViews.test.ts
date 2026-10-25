import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const [name, extra, body] of [
  [
    "slice",
    "",
    "local const data:int[2]=[1,2];local view:int[]=data as int[];view;",
  ],
  [
    "pointer",
    "",
    "local const data:int[2]=[1,2];local view:*int=data as *int;view;",
  ],
  [
    "grouped",
    "",
    "local const data:int[2]=[1,2];local view:int[]=((data)) as int[];view;",
  ],
  [
    "alias",
    "type Values=int[2];type View=int[];",
    "local const data:Values=[1,2];local view:View=data as View;view;",
  ],
  [
    "field",
    "struct Box{data:int[2],}",
    "local const box:Box=Box{data:[1,2]};local view:int[]=box.data as int[];view;",
  ],
  [
    "nested array",
    "",
    "local const data:int[2][2]=[[1,2],[3,4]];local view:int[]=data[0] as int[];view;",
  ],
] as const) {
  test(`as conversion rejects constant array views: ${name}`, () => {
    const checker = new TypeChecker({ collectAllErrors: true });
    checker.checkProgram(
      new Parser(
        `${extra}frame main(){${body}}`,
        "as-constant-array.bpl",
      ).parse(),
    );
    const errors = checker.getErrors();
    expect(errors.filter((error) => error.code !== "BPL_CAST_INVALID")).toEqual(
      [],
    );
    expect(errors.some((error) => error.code === "BPL_CAST_INVALID")).toBe(
      true,
    );
  });
}

test("as conversion preserves mutable borrows and copies of constant arrays", () => {
  expectCorrectnessSuite([
    {
      name: "as-array-conversions",
      validateLlvm: true,
      source: `frame main()ret int{
      local data:int[2]=[1,2];local view:int[]=data as int[];view[0]=3;
      local pointer:*int=data as *int;pointer[1]=4;
      if(data[0]!=3||data[1]!=4)return 1;
      local const fixed:int[2]=[5,6];local copy:int[2]=fixed as int[2];copy[0]=7;
      if(fixed[0]!=5||copy[0]!=7)return 2;
      local literal:int[]=[8,9] as int[];if(literal[1]!=9)return 3;
      return 0;
    }`,
    },
  ]);
}, 60000);
