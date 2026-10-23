import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

const declarations = `struct Owner{value:int,@[auto_destroy]frame destroy(this:*Owner){this.value=0;}}
struct Source<T>{value:T,frame __get__(this:*Source<T>,index:int)ret T{index;return this.value;}}
struct Maker<T>{value:T,frame __mul__(this:*Maker<T>)ret T{return this.value;}}
struct GenericFresh<T>{value:T,frame __get__(this:*GenericFresh<T>,index:int)ret Owner{this;index;return Owner{value:7};}}
struct Borrowed<T>{value:*T,frame __get__(this:*Borrowed<T>,index:int)ret *T{index;return this.value;}}
type Alias=Source<Owner>;`;
/** Check one generic receiver use without emitting or running its program. */
function errors(body: string) {
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(
    new Parser(
      `${declarations}frame main(){${body}}`,
      "generic-overload-ownership.bpl",
    ).parse(),
  );
  return checker.getErrors();
}
for (const [name, body] of [
  [
    "getter field return",
    "local source:Source<Owner>=Source<Owner>{value:Owner{value:7}};local copy:Owner=source[0];copy.value;",
  ],
  [
    "star field return",
    "local source:Maker<Owner>=Maker<Owner>{value:Owner{value:7}};local copy:Owner=*source;copy.value;",
  ],
  [
    "aliased getter owner",
    "local source:Alias=Source<Owner>{value:Owner{value:7}};local copy:Owner=source[0];copy.value;",
  ],
  [
    "generic fresh result limitation",
    "local source:GenericFresh<int>=GenericFresh<int>{value:1};local copy:Owner=source[0];copy.value;",
  ],
] as const) {
  test(`generic overloads retain owning-copy restriction for ${name}`, () => {
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
    "nonowning generic result",
    "local source:Source<int>=Source<int>{value:7};local value:int=source[0];value;",
  ],
  [
    "generic borrowed pointer result",
    "local owner:Owner=Owner{value:7};local source:Borrowed<Owner>=Borrowed<Owner>{value:&owner};local value:*Owner=source[0];value.value;",
  ],
] as const) {
  test(`generic overload restrictions retain ${name}`, () => {
    expect(errors(body)).toEqual([]);
  });
}
