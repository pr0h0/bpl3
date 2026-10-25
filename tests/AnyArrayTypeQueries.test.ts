import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const [name, declarations, type, matching] of [
  ["direct", "", "Any[2]", "Any[2]"],
  ["alias", "type Values=Any[2];", "Values", "Any[2]"],
  ["slice", "", "Any[]", "Any[]"],
] as const) {
  for (const syntax of ["match", "is"] as const) {
    const query = (target: string) =>
      syntax === "match" ? `match<${target}>(value)` : `value is ${target}`;
    test(`${syntax} compares ${name} Any arrays as whole values`, () => {
      expectCorrectnessSuite([
        {
          name: `any-array-query-${name}-${syntax}`,
          validateLlvm: true,
          source: `import [Any] from "std/type.bpl";${declarations}frame main()ret int{
          local value:${type}=[cast<Any>(1),cast<Any>(2)];
          if(!(${query(matching)}))return 1;
          if(${query("Any[3]")}||${query("int[2]")})return 2;
          return 0;
        }`,
        },
      ]);
    }, 60000);
  }
}
test("scalar Any queries retain runtime payload matching", () => {
  expectCorrectnessSuite([
    {
      name: "any-array-scalar-control",
      validateLlvm: true,
      source: `import [Any] from "std/type.bpl";frame main()ret int{
      local value:Any=cast<Any>(7);
      if(!match<int>(value)||!(value is int))return 1;
      if(match<float>(value)||value is float)return 2;
      return 0;
    }`,
    },
  ]);
}, 60000);
