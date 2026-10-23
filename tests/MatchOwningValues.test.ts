import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

const declarations = `global destroyed:int=0;struct Owner{value:int,@[auto_destroy]frame destroy(this:*Owner){destroyed=destroyed+1;this.value=0;}}struct Holder{value:Owner,}`;
for (const [name, extra, body] of [
  [
    "function expression arm",
    "frame get(source:*Holder)ret Owner{return match(true){true=>source.value,false=>Owner{value:8},};}",
    "local source:Holder=Holder{value:Owner{value:7}};local value:Owner=get(&source);value.value;",
  ],
  [
    "function block arm",
    "frame get(source:*Holder)ret Owner{return match(true){true=>{return source.value;},false=>Owner{value:8},};}",
    "local source:Holder=Holder{value:Owner{value:7}};local value:Owner=get(&source);value.value;",
  ],
  [
    "getter expression arm",
    "struct Source{value:Owner,frame __get__(this:*Source,index:int)ret Owner{return match(index){0=>this.value,_=>Owner{value:8},};}}",
    "local source:Source=Source{value:Owner{value:7}};local value:Owner=source[0];value.value;",
  ],
  [
    "star block arm",
    "struct Maker{value:Owner,frame __mul__(this:*Maker)ret Owner{return match(true){true=>{return this.value;},false=>Owner{value:8},};}}",
    "local source:Maker=Maker{value:Owner{value:7}};local value:Owner=*source;value.value;",
  ],
  [
    "initializer expression arm",
    "",
    "local source:Holder=Holder{value:Owner{value:7}};local value:Owner=match(true){true=>source.value,false=>Owner{value:8},};value.value;",
  ],
  [
    "initializer block arm",
    "",
    "local source:Holder=Holder{value:Owner{value:7}};local value:Owner=match(true){true=>{return source.value;},false=>Owner{value:8},};value.value;",
  ],
  [
    "outer local expression arm",
    "",
    "local source:Owner=Owner{value:7};local value:Owner=match(true){true=>source,false=>Owner{value:8},};value.value;",
  ],
  [
    "outer local block arm",
    "",
    "local source:Owner=Owner{value:7};local value:Owner=match(true){true=>{return source;},false=>Owner{value:8},};value.value;",
  ],
  [
    "nested match field",
    "frame get(source:*Holder)ret Owner{return match(true){true=>match(false){true=>Owner{value:8},false=>source.value,},false=>Owner{value:8},};}",
    "local source:Holder=Holder{value:Owner{value:7}};local value:Owner=get(&source);value.value;",
  ],
] as const) {
  test(`match ownership rejects ${name} copies`, () => {
    const checker = new TypeChecker({ collectAllErrors: true });
    checker.checkProgram(
      new Parser(
        `${declarations}${extra}frame main(){${body}}`,
        "match-owning-values.bpl",
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
test("match ownership retains fresh values and explicit arm-local transfers", () => {
  expectCorrectnessSuite([
    {
      name: "match-owning-transfers",
      validateLlvm: true,
      source: `${declarations}
 frame make(index:int)ret Owner{return match(index){0=>Owner{value:7},_=>{local value:Owner=Owner{value:8};return value;},};}
 frame main()ret int{{local first:Owner=make(0);if(first.value!=7 || destroyed!=0)return 1;}if(destroyed!=1)return 2;{local second:Owner=make(1);if(second.value!=8 || destroyed!=1)return 3;}if(destroyed!=2)return 4;return 0;}`,
    },
  ]);
}, 60000);
