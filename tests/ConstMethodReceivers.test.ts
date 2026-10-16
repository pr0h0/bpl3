import { expect, test } from "bun:test";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

function errors(source: string) {
  const file = "const-receiver.bpl";
  const program = new Parser(
    source,
    file,
    lexWithGrammar(source, file),
  ).parse();
  const checker = new TypeChecker();
  checker.checkProgram(program);
  return checker.getErrors();
}
const counter = `struct Counter {
 value:int,
 frame bump(this:*Counter) {this.value=this.value+1;}
 frame read(this:Counter)ret int{return this.value;}
 frame __call__(this:*Counter)ret int {this.value=this.value+1;return this.value;}
 frame __add__(this:*Counter,other:Counter)ret int {this.value=this.value+other.value;return this.value;}
 frame __get__(this:*Counter,index:int)ret int {this.value=this.value+index;return this.value;}
}`;

for (const expression of [
  "counter.bump();",
  "local callback:Lambda<void>()=counter.bump;callback();",
]) {
  test(`const structs cannot acquire pointer receivers: ${expression}`, () => {
    const result = errors(`${counter} frame main()ret int {
      local const counter:Counter=Counter{value:1}; ${expression} return counter.value;
    }`);
    expect(
      result.some((error) => error.code === "BPL_ADDRESS_OF_CONSTANT"),
    ).toBe(true);
  });
}
for (const expression of ["counter()", "counter+counter", "counter[1]"]) {
  test(`const struct operators cannot acquire pointer receivers: ${expression}`, () => {
    expect(
      errors(`${counter} frame main()ret int {
      local const counter:Counter=Counter{value:1}; return ${expression};
    }`).length,
    ).toBeGreaterThan(0);
  });
}
test("implicit pointer arguments cannot expose const structs to operator mutation", () => {
  expect(
    errors(`struct Box {
    value:int,
    frame __add__(this:Box,other:*Box)ret int {other.value=this.value;return other.value;}
  } frame main()ret int {
    local left:Box=Box{value:2};local const right:Box=Box{value:1};return left+right;
  }`).length,
  ).toBeGreaterThan(0);
});
test("generic and nested const receivers preserve address restrictions", () => {
  for (const source of [
    `struct Box<T>{value:T,frame touch(this:*Box<T>)ret T{return this.value;}}
     frame main()ret int {local const box:Box<int>=Box<int>{value:1};return box.touch();}`,
    `${counter} struct Outer{counter:Counter,}
     frame main()ret int {local const outer:Outer=Outer{counter:Counter{value:1}};outer.counter.bump();return outer.counter.value;}`,
  ])
    expect(
      errors(source).some((error) => error.code === "BPL_ADDRESS_OF_CONSTANT"),
    ).toBe(true);
});
test("value receivers on const structs and pointer receivers on mutable structs remain valid", () => {
  expect(
    errors(`${counter} frame main()ret int {
    local const fixed:Counter=Counter{value:1}; local mutable:Counter=Counter{value:2};
    mutable.bump();local p:*Counter=&mutable;p.bump();return fixed.read()+mutable();
  }`),
  ).toEqual([]);
});

test("const value receiver calls copy their receiver and select safe overloads", async () => {
  const { expectCorrectnessSuite } =
    await import("./helpers/compilerCorrectness");
  expectCorrectnessSuite([
    {
      name: "const-value-receivers",
      validateLlvm: true,
      source: `${counter}
      struct Copy {
        value:int,
        frame change(this:Copy)ret int {this.value=99;return this.value;}
        frame read(this:*Copy)ret int {this.value=8;return this.value;}
        frame read(this:Copy)ret int {return this.value;}
      }
      frame main()ret int {
        local const fixed:Counter=Counter{value:1};
        local mutable:Counter=Counter{value:2};mutable.bump();
        local p:*Counter=&mutable;p.bump();
        if(fixed.read()!=1||mutable()!=5){return 1;}
        local const copy:Copy=Copy{value:7};
        if(copy.change()!=99||copy.value!=7||copy.read()!=7){return 3;}
        return 0;
      }`,
      expectedStdout: "",
    },
  ]);
}, 60000);
