import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
const declarations = `struct Owner{value:int,@[auto_destroy]frame destroy(this:*Owner){this.value=0;}}
struct Maker{frame __mul__(this:*Maker)ret Owner{this;return Owner{value:7};}}
struct Source{frame __get__(this:*Source,index:int)ret Owner{this;return Owner{value:7+index};}}
struct Holder{value:Owner,}
frame make()ret Owner{return Owner{value:7};}
frame identity(value:Owner)ret Owner{return value;}`;
/** Check assignment fragments without executing their owning values. */
function errors(body: string) {
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(
    new Parser(
      `${declarations}frame main(){${body}}`,
      "owning-overload-assignment.bpl",
    ).parse(),
  );
  return checker.getErrors();
}
for (const [name, body] of [
  [
    "ordinary fresh call",
    "local owner:Owner=Owner{value:1};owner=make();owner.value;",
  ],
  [
    "conditional fresh getter",
    "local source:Source=Source{};local owner:Owner=Owner{value:1};owner=true?source[0]:make();owner.value;",
  ],
  [
    "match fresh getter",
    "local source:Source=Source{};local owner:Owner=Owner{value:1};owner=match(true){true=>source[0],false=>make(),};owner.value;",
  ],
  [
    "aggregate containing fresh getter",
    "local source:Source=Source{};local holder:Holder=Holder{value:Owner{value:1}};holder=Holder{value:source[0]};holder.value.value;",
  ],
  [
    "call forwarding fresh getter",
    "local source:Source=Source{};local owner:Owner=Owner{value:1};owner=identity(source[0]);owner.value;",
  ],
  [
    "initialized star destination",
    "local maker:Maker=Maker{};local owner:Owner=Owner{value:1};owner=*maker;owner.value;",
  ],
  [
    "uninitialized star destination",
    "local maker:Maker=Maker{};local owner:Owner;owner=*maker;owner.value;",
  ],
  [
    "grouped star value",
    "local maker:Maker=Maker{};local owner:Owner=Owner{value:1};owner=(*maker);owner.value;",
  ],
  [
    "initialized getter destination",
    "local source:Source=Source{};local owner:Owner=Owner{value:1};owner=source[0];owner.value;",
  ],
  [
    "uninitialized getter destination",
    "local source:Source=Source{};local owner:Owner;owner=source[0];owner.value;",
  ],
  [
    "grouped getter value",
    "local source:Source=Source{};local owner:Owner=Owner{value:1};owner=((source[0]));owner.value;",
  ],
  [
    "field destination",
    "local source:Source=Source{};local holder:Holder=Holder{value:Owner{value:1}};holder.value=source[0];holder.value.value;",
  ],
] as const) {
  test(`owning overload assignment retains rejection for ${name}`, () => {
    const result = errors(body);
    expect(
      result.filter((error) => error.code !== "BPL_OWNING_VALUE_COPIED"),
    ).toEqual([]);
    expect(
      result.some((error) => error.code === "BPL_OWNING_VALUE_COPIED"),
    ).toBe(true);
  });
}
for (const [name, body] of [
  [
    "fresh star initializer",
    "local maker:Maker=Maker{};local owner:Owner=*maker;owner.value;",
  ],
  [
    "fresh getter initializer",
    "local source:Source=Source{};local owner:Owner=source[0];owner.value;",
  ],
  ["nonowning assignment", "local value:int=1;value=2;value;"],
  [
    "borrowed pointer assignment",
    "local owner:Owner=Owner{value:1};local pointer:*Owner=&owner;pointer=&owner;pointer.value;",
  ],
] as const) {
  test(`overload assignment rules retain ${name}`, () => {
    expect(errors(body)).toEqual([]);
  });
}
