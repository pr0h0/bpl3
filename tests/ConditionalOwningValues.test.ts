import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";
const declarations = `global destroyed:int=0;struct Owner{value:int,@[auto_destroy]frame destroy(this:*Owner){destroyed=destroyed+1;this.value=0;}}struct Holder{value:Owner,}frame make(value:int)ret Owner{return Owner{value:value};}frame consume(value:Owner)ret int{return value.value;}`;
for (const [name, extra, body] of [
  [
    "initializer",
    "",
    "local owner:Owner=Owner{value:7};local value:Owner=true?owner:make(8);value.value;",
  ],
  [
    "function return",
    "frame get(source:*Holder)ret Owner{return true?source.value:make(8);}",
    "local source:Holder=Holder{value:make(7)};local value:Owner=get(&source);value.value;",
  ],
  [
    "getter return",
    "struct Source{value:Owner,frame __get__(this:*Source,index:int)ret Owner{return index==0?this.value:make(8);}}",
    "local source:Source=Source{value:make(7)};local value:Owner=source[0];value.value;",
  ],
  [
    "star return",
    "struct Maker{value:Owner,frame __mul__(this:*Maker)ret Owner{return true?this.value:make(8);}}",
    "local source:Maker=Maker{value:make(7)};local value:Owner=*source;value.value;",
  ],
  [
    "conditional local return",
    "frame get()ret Owner{local owner:Owner=make(7);return true?owner:make(8);}",
    "local value:Owner=get();value.value;",
  ],
  [
    "argument",
    "",
    "local owner:Owner=make(7);local value:int=consume(true?owner:make(8));value;",
  ],
] as const) {
  test(`conditional ownership rejects ${name} copies`, () => {
    const checker = new TypeChecker({ collectAllErrors: true });
    checker.checkProgram(
      new Parser(
        `${declarations}${extra}frame main(){${body}}`,
        "conditional-owning-values.bpl",
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
test("conditional ownership retains fresh values and normal cleanup", () => {
  expectCorrectnessSuite([
    {
      name: "conditional-owning-transfer",
      validateLlvm: true,
      source: `${declarations}frame choose(flag:bool)ret Owner{return flag?make(7):Owner{value:8};}frame main()ret int{{local first:Owner=choose(true);if(first.value!=7 || destroyed!=0)return 1;}if(destroyed!=1)return 2;{local second:Owner=choose(false);if(second.value!=8 || destroyed!=1)return 3;}if(destroyed!=2)return 4;return 0;}`,
    },
  ]);
}, 60000);
