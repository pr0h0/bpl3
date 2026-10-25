import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

const declarations =
  "struct Animal{value:int,frame id(this:*Animal)ret int{return this.value;}}";
for (const [name, setup, target, other] of [
  [
    "object values",
    "local value:Animal[2]=[Animal{value:7},Animal{value:8}];",
    "Animal[2]",
    "Animal[3]",
  ],
  [
    "object references",
    "local first:Animal=Animal{value:7};local second:Animal=Animal{value:8};local value:*Animal[2]=[&first,&second];",
    "*Animal[2]",
    "*Animal[3]",
  ],
] as const) {
  for (const syntax of ["match", "is"] as const) {
    const query = (type: string) =>
      syntax === "match" ? `match<${type}>(value)` : `value is ${type}`;
    test(`${syntax} compares arrays of ${name} without scalar class checks`, () => {
      expectCorrectnessSuite([
        {
          name: `class-array-query-${syntax}-${name.replaceAll(" ", "-")}`,
          validateLlvm: true,
          source: `${declarations}frame main()ret int{${setup}if(!(${query(target)}))return 1;if(${query(other)})return 2;return 0;}`,
        },
      ]);
    }, 60000);
  }
}

test("individual class runtime queries retain their existing behavior", () => {
  expectCorrectnessSuite([
    {
      name: "class-array-query-scalar-control",
      validateLlvm: true,
      source: `${declarations}struct Child:Animal{extra:int,}frame main()ret int{
   local child:Child=Child{value:7,extra:8};local base:*Animal=cast<*Animal>(&child);
   if(!match<Child>(base)||!(base is Child))return 1;
   if(!match<*Child>(base)||!(base is *Child))return 2;
   return 0;
  }`,
    },
  ]);
}, 60000);
