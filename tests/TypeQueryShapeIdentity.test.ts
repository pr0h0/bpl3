import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const [name, declarations, setup, matching, different] of [
  [
    "generic arguments",
    "struct Box<T>{value:T,}",
    "local value:Box<int>=Box<int>{value:7};",
    "Box<int>",
    "Box<bool>",
  ],
  ["fixed array length", "", "local value:int[2]=[1,2];", "int[2]", "int[3]"],
] as const) {
  for (const syntax of ["match", "is"] as const) {
    const query = (target: string) =>
      syntax === "match" ? `match<${target}>(value)` : `value is ${target}`;
    test(`${syntax} distinguishes ${name} at O0/O3`, () => {
      expectCorrectnessSuite([
        {
          name: `query-shape-${syntax}-${name.replaceAll(" ", "-")}`,
          validateLlvm: true,
          source: `${declarations}frame main()ret int{${setup}if(!(${query(matching)}))return 1;if(${query(different)})return 2;return 0;}`,
        },
      ]);
    }, 60000);
  }
}
test("type queries preserve existing static inheritance matches", () => {
  expectCorrectnessSuite([
    {
      name: "type-query-inheritance-control",
      validateLlvm: true,
      source: `struct Base{value:int,}struct Child:Base{extra:int,}frame main()ret int{
      local value:Child=Child{value:7,extra:8};
      if(!match<Base>(value)||!(value is Base))return 1;
      return 0;
    }`,
    },
  ]);
}, 60000);
