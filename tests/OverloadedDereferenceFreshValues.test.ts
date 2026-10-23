import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

const declarations = `global destroyed:int=0;
struct Owner{value:int,@[auto_destroy]frame destroy(this:*Owner){destroyed=destroyed+1;this.value=0;}}
struct Maker{frame __mul__(this:*Maker)ret Owner{this;return Owner{value:7};}}`;
for (const [name, expression] of [
  ["direct", "*maker"],
  ["grouped", "(*maker)"],
] as const) {
  test(`owning-copy rules accept ${name} fresh overloaded star values`, () => {
    const checker = new TypeChecker({ collectAllErrors: true });
    checker.checkProgram(
      new Parser(
        `${declarations}frame main(){local maker:Maker=Maker{};local value:Owner=${expression};value.value;}`,
        "overloaded-dereference-values.bpl",
      ).parse(),
    );
    expect(checker.getErrors()).toEqual([]);
  });
}
test("fresh overloaded star values retain normal cleanup", () => {
  expectCorrectnessSuite([
    {
      name: "overloaded-star-owning-value",
      validateLlvm: true,
      source: `${declarations}frame main()ret int{local maker:Maker=Maker{};{local value:Owner=*maker;if(value.value!=7 || destroyed!=0)return 1;}if(destroyed!=1)return 2;return 0;}`,
    },
  ]);
}, 60000);
