import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";
const declarations = `global destroyed:int=0;struct Owner{value:int,@[auto_destroy]frame destroy(this:*Owner){destroyed=destroyed+1;this.value=0;}}struct Holder{value:Owner,}frame make(value:int)ret Owner{return Owner{value:value};}frame consume(value:Owner)ret int{return value.value;}`;
for (const [name, extra, body] of [
  [
    "initializer",
    "",
    "local owner:Owner=make(7);local value:Owner=cast<Owner>(owner);value.value;",
  ],
  [
    "function return",
    "frame get(source:*Holder)ret Owner{return cast<Owner>(source.value);}",
    "local source:Holder=Holder{value:make(7)};local value:Owner=get(&source);value.value;",
  ],
  [
    "getter return",
    "struct Source{value:Owner,frame __get__(this:*Source,index:int)ret Owner{index;return cast<Owner>(this.value);}}",
    "local source:Source=Source{value:make(7)};local value:Owner=source[0];value.value;",
  ],
  [
    "star return",
    "struct Maker{value:Owner,frame __mul__(this:*Maker)ret Owner{return cast<Owner>(this.value);}}",
    "local source:Maker=Maker{value:make(7)};local value:Owner=*source;value.value;",
  ],
  [
    "argument",
    "",
    "local owner:Owner=make(7);local value:int=consume(cast<Owner>(owner));value;",
  ],
  [
    "array element",
    "",
    "local owner:Owner=make(7);local values:Owner[1]=[cast<Owner>(owner)];values[0].value;",
  ],
  [
    "target alias",
    "type Alias=Owner;",
    "local owner:Owner=make(7);local value:Alias=cast<Alias>(owner);value.value;",
  ],
] as const) {
  test(`cast ownership rejects ${name} copies`, () => {
    const checker = new TypeChecker({ collectAllErrors: true });
    checker.checkProgram(
      new Parser(
        `${declarations}${extra}frame main(){${body}}`,
        "cast-owning-values.bpl",
      ).parse(),
    );
    const errors = checker.getErrors();
    expect(
      errors.filter((error) => error.code !== "BPL_OWNING_VALUE_COPIED"),
    ).toEqual([]);
    expect(
      errors.some((error) => error.code === "BPL_OWNING_VALUE_COPIED"),
    ).toBe(true);
  });
}
test("cast ownership retains fresh values and normal cleanup", () => {
  expectCorrectnessSuite([
    {
      name: "cast-owning-transfer",
      validateLlvm: true,
      source: `${declarations}frame main()ret int{{local first:Owner=cast<Owner>(Owner{value:7});if(first.value!=7 || destroyed!=0)return 1;}if(destroyed!=1)return 2;{local second:Owner=cast<Owner>(make(8));local pointer:*Owner=cast<*Owner>(&second);if(pointer.value!=8 || destroyed!=1)return 3;}if(destroyed!=2)return 4;return 0;}`,
    },
  ]);
}, 60000);
