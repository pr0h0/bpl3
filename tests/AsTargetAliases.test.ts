import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

const declarations = `
struct Base{value:int,frame get(this:*Base)ret int{return this.value;}}
struct Left:Base{}
struct Right:Base{}
`;
for (const [name, aliases, target] of [
  ["direct pointer alias", "type Target=*Right;", "Target"],
  ["transitive pointer alias", "type Root=*Right;type Target=Root;", "Target"],
  ["generic pointer alias", "type Pointer<T>=*T;", "Pointer<Right>"],
  ["pointer to struct alias", "type Target=Right;", "*Target"],
] as const) {
  test(`as target normalization preserves downcast checks for ${name}`, () => {
    expectCorrectnessSuite([
      {
        name: `as-target-${name.replaceAll(" ", "-")}`,
        validateLlvm: true,
        source: `${declarations}${aliases}frame main()ret int{
        local left:Left=Left{value:7};local right:Right=Right{value:8};
        local wrong:*Base=cast<*Base>(&left);local correct:*Base=cast<*Base>(&right);
        local direct:*Right=wrong as *Right;if(direct!=nullptr)return 1;
        local rejected:${target}=wrong as ${target};if(rejected!=nullptr)return 2;
        local accepted:${target}=correct as ${target};if(accepted!=&right)return 3;
        local empty:*Base=nullptr;local absent:${target}=empty as ${target};if(absent!=nullptr)return 4;
        return 0;
      }`,
      },
    ]);
  }, 60000);
}

test("as direct targets retain checks when the source uses an alias", () => {
  expectCorrectnessSuite([
    {
      name: "as-source-alias-control",
      validateLlvm: true,
      source: `${declarations}type Source=*Base;frame main()ret int{
      local left:Left=Left{value:7};local right:Right=Right{value:8};right.value;
      local source:Source=cast<*Base>(&left);local result:*Right=source as *Right;
      if(result!=nullptr)return 1;return 0;
    }`,
    },
  ]);
}, 60000);
