import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

const declarations = `global destroyed:int=0;struct Owner{value:int,
 frame __neg__(this:Owner)ret int{return -this.value;}
 frame __add__(this:Owner,other:int)ret int{return this.value+other;}
 frame __lt__(this:Owner,other:int)ret bool{return this.value<other;}
 frame __mul__(this:*Owner,other:Owner)ret int{return this.value+other.value;}
 frame __sub__(this:*Owner,other:int)ret int{return this.value-other;}
 frame __div__(this:*Owner,other:*Owner)ret int{return this.value+other.value;}
 @[auto_destroy]frame destroy(this:*Owner){destroyed=destroyed+1;this.value=0;}}
struct Wrapper<T>{value:T,frame __neg__(this:Wrapper<T>)ret int{this;return 0;}}`;
function errors(body: string) {
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(
    new Parser(
      `${declarations}frame main(){${body}}`,
      "operator-owning-copies.bpl",
    ).parse(),
  );
  return checker.getErrors();
}
for (const [name, body] of [
  ["unary receiver", "local owner:Owner=Owner{value:7};-owner;"],
  ["grouped receiver", "local owner:Owner=Owner{value:7};-((owner));"],
  ["indexed receiver", "local owners:Owner[1]=[Owner{value:7}];-owners[0];"],
  [
    "dereferenced receiver",
    "local owner:Owner=Owner{value:7};local pointer:*Owner=&owner;-(*pointer);",
  ],
  ["binary receiver", "local owner:Owner=Owner{value:7};owner+3;"],
  ["swapped receiver", "local owner:Owner=Owner{value:7};3>owner;"],
  [
    "binary argument",
    "local left:Owner=Owner{value:7};local right:Owner=Owner{value:3};left*right;",
  ],
  [
    "generic aggregate receiver",
    "local owner:Wrapper<Owner>=Wrapper<Owner>{value:Owner{value:7}};-owner;",
  ],
] as const) {
  test(`operators reject copying owning ${name}`, () => {
    expect(
      errors(body).some((error) => error.code === "BPL_OWNING_VALUE_COPIED"),
    ).toBe(true);
  });
}
for (const [name, body] of [
  ["pointer receiver", "local owner:Owner=Owner{value:7};owner-3;"],
  [
    "borrowed argument",
    "local left:Owner=Owner{value:7};local right:Owner=Owner{value:3};left/right;",
  ],
  ["fresh unary receiver", "-Owner{value:7};"],
  ["fresh binary receiver", "Owner{value:7}+3;"],
  [
    "fresh binary argument",
    "local left:Owner=Owner{value:7};left*Owner{value:3};",
  ],
] as const) {
  test(`operator owning-copy rules retain ${name}`, () => {
    expect(errors(body)).toEqual([]);
  });
}

test("fresh owner operator values clean up once while borrowed operands remain live", () => {
  expectCorrectnessSuite([
    {
      name: "fresh-owning-operator-controls",
      validateLlvm: true,
      source: `${declarations}frame main()ret int{
      local left:Owner=Owner{value:7};
      local unary:int=-Owner{value:2};if(unary!=-2 || destroyed!=1)return 1;
      local binary:int=Owner{value:3}+4;if(binary!=7 || destroyed!=2)return 2;
      local argument:int=left*Owner{value:5};if(argument!=12 || destroyed!=3)return 3;
      local borrowed:int=left-1;if(borrowed!=6 || left.value!=7 || destroyed!=3)return 4;return 0;}`,
    },
  ]);
}, 60000);
