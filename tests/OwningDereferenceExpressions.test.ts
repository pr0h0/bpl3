import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

const declarations = `global destroyed:int=0;
struct Owner{value:int,
 frame __neg__(this:Owner)ret int{return -this.value;}
 frame __add__(this:Owner,other:int)ret int{return this.value+other;}
 frame __mul__(this:*Owner,other:Owner)ret int{return this.value+other.value;}
 @[auto_destroy]frame destroy(this:*Owner){destroyed=destroyed+1;this.value=0;}}
struct Holder{value:Owner,}
frame borrow(value:*Owner)ret *Owner{return value;}
frame make()ret Owner{return Owner{value:7};}
frame take(value:Owner){value.value;}
frame takePointer(value:*Owner){value.value;}`;
function errors(body: string) {
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(
    new Parser(
      `${declarations}frame main(){local owner:Owner=Owner{value:7};owner.value;${body}}`,
      "owning-dereferences.bpl",
    ).parse(),
  );
  return checker.getErrors();
}
for (const [name, body] of [
  ["call initializer", "local copy:Owner=*borrow(&owner);copy.value;"],
  ["grouped call", "local copy:Owner=*((borrow(&owner)));copy.value;"],
  ["conditional pointer", "local copy:Owner=*(true?&owner:&owner);copy.value;"],
  ["cast pointer", "local copy:Owner=*cast<*Owner>(&owner);copy.value;"],
  ["address expression", "local copy:Owner=*(&owner);copy.value;"],
  [
    "assignment",
    "local copy:Owner=Owner{value:0};copy=*borrow(&owner);copy.value;",
  ],
  ["ordinary argument", "take(*borrow(&owner));"],
  ["unary receiver", "-(*borrow(&owner));"],
  ["binary receiver", "(*borrow(&owner))+1;"],
  ["operator argument", "owner*(*borrow(&owner));"],
  [
    "struct field",
    "local holder:Holder=Holder{value:*borrow(&owner)};holder.value.value;",
  ],
] as const) {
  test(`owning-copy rules reject borrowed dereference from ${name}`, () => {
    expect(
      errors(body).some((error) => error.code === "BPL_OWNING_VALUE_COPIED"),
    ).toBe(true);
  });
}
for (const [name, body] of [
  ["fresh ordinary call", "local value:Owner=make();value.value;"],
  ["pointer argument", "takePointer(borrow(&owner));"],
  ["fresh literal", "local value:Owner=Owner{value:7};value.value;"],
] as const) {
  test(`owning-copy rules retain ${name}`, () => {
    expect(errors(body)).toEqual([]);
  });
}

test("owning-copy rules still reject dereferencing an existing pointer binding", () => {
  expect(
    errors(
      "local pointer:*Owner=&owner;local copy:Owner=*pointer;copy.value;",
    ).some((error) => error.code === "BPL_OWNING_VALUE_COPIED"),
  ).toBe(true);
});
