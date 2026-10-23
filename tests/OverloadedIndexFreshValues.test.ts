import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

const declarations = `global destroyed:int=0;
struct Owner{value:int,frame __neg__(this:Owner)ret int{return -this.value;}@[auto_destroy]frame destroy(this:*Owner){destroyed=destroyed+1;this.value=0;}}
struct Source{frame __get__(this:*Source,index:int)ret Owner{this;return Owner{value:7+index};}}
struct BorrowedSource{value:*Owner,frame __get__(this:*BorrowedSource,index:int)ret *Owner{index;return this.value;}}
frame consume(value:Owner)ret int{return value.value;}`;
for (const [name, expression] of [
  ["direct", "source[0]"],
  ["grouped", "((source[0]))"],
] as const) {
  test(`owning-copy rules accept ${name} fresh getter results`, () => {
    const checker = new TypeChecker({ collectAllErrors: true });
    checker.checkProgram(
      new Parser(
        `${declarations}frame main(){local source:Source=Source{};local value:Owner=${expression};value.value;}`,
        "fresh-getter-values.bpl",
      ).parse(),
    );
    expect(checker.getErrors()).toEqual([]);
  });
}
test("dereferencing a getter's borrowed pointer still rejects owning copies", () => {
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(
    new Parser(
      `${declarations}frame main(){local owner:Owner=Owner{value:7};local source:BorrowedSource=BorrowedSource{value:&owner};local copy:Owner=*source[0];copy.value;}`,
      "borrowed-getter-pointer.bpl",
    ).parse(),
  );
  expect(
    checker
      .getErrors()
      .some((error) => error.code === "BPL_OWNING_VALUE_COPIED"),
  ).toBe(true);
});
test("fresh getter values retain normal cleanup", () => {
  expectCorrectnessSuite([
    {
      name: "fresh-getter-owning-value",
      validateLlvm: true,
      source: `${declarations}frame main()ret int{local source:Source=Source{};{local value:Owner=source[0];if(value.value!=7 || destroyed!=0)return 1;}if(destroyed!=1)return 2;local consumed:int=consume(source[1]);if(consumed!=8 || destroyed!=2)return 3;local negated:int=-source[2];if(negated!=-9 || destroyed!=3)return 4;return 0;}`,
    },
  ]);
}, 60000);

test("built-in array element reads still reject owning copies", () => {
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(
    new Parser(
      `${declarations}frame main(){local values:Owner[1]=[Owner{value:7}];local copy:Owner=values[0];copy.value;}`,
      "owning-array-element.bpl",
    ).parse(),
  );
  expect(
    checker
      .getErrors()
      .some((error) => error.code === "BPL_OWNING_VALUE_COPIED"),
  ).toBe(true);
});
