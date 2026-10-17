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
    }`).some((error) => error.code === "BPL_ADDRESS_OF_CONSTANT"),
    ).toBe(true);
  });
}
test("implicit pointer arguments cannot expose const structs to operator mutation", () => {
  expect(
    errors(`struct Box {
    value:int,
    frame __add__(this:Box,other:*Box)ret int {other.value=this.value;return other.value;}
  } frame main()ret int {
    local left:Box=Box{value:2};local const right:Box=Box{value:1};return left+right;
  }`).some((error) => error.code === "BPL_ADDRESS_OF_CONSTANT"),
  ).toBe(true);
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

test("const operator diagnostics preserve viable overloads and synthesis", () => {
  const source = `struct Value {
    number:int,
    frame __call__(this:*Value)ret int{return this.number;}
    frame __call__(this:Value)ret int{return this.number;}
    frame __ne__(this:*Value,other:Value)ret bool{return this.number!=other.number;}
    frame __eq__(this:Value,other:Value)ret bool{return this.number==other.number;}
    frame __gt__(this:*Value,other:Value)ret bool{return this.number>other.number;}
    frame __lt__(this:Value,other:Value)ret bool{return this.number<other.number;}
  }
  frame main()ret int {
    local const left:Value=Value{number:1};local const right:Value=Value{number:2};
    if(left()!=1||!(left!=right)||!(right>left)){return 1;}return 0;
  }`;
  expect(errors(source)).toEqual([]);
});

test("const operator diagnostics require an otherwise compatible overload", () => {
  const result = errors(`struct Value {
    number:int,
    frame __call__(this:*Value,argument:bool)ret int {
      if(argument){return this.number;}return 0;
    }
  }
  frame main()ret int {
    local const value:Value=Value{number:1};return value("wrong type");
  }`);
  expect(
    result.some((error) => error.code === "BPL_CALL_TARGET_NOT_CALLABLE"),
  ).toBe(true);
  expect(result.some((error) => error.code === "BPL_ADDRESS_OF_CONSTANT")).toBe(
    false,
  );
});

test("unary pointer operators on const receivers report the address restriction", () => {
  const result = errors(`struct Value {
    number:int,
    frame __neg__(this:*Value)ret int{return -this.number;}
  }
  frame main()ret int {
    local const value:Value=Value{number:1};return -value;
  }`);
  expect(result.some((error) => error.code === "BPL_ADDRESS_OF_CONSTANT")).toBe(
    true,
  );
});

test("const operator arguments retain built-in pointer arithmetic", async () => {
  const { expectCorrectnessSuite } =
    await import("./helpers/compilerCorrectness");
  expectCorrectnessSuite([
    {
      name: "const-pointer-arithmetic-fallback",
      validateLlvm: true,
      source: `struct Value {
 number:int,
 frame __add__(this:*Value,_count:*int)ret *Value{return this;}
 frame __sub__(this:*Value,_count:*int)ret *Value{return this;}
}
frame main()ret int {
 local values:Value[2];values[0]=Value{number:3};values[1]=Value{number:7};
 local ptr:*Value=&values[0];local const count:int=1;
 local next:*Value=ptr+count;
 local previous:*Value=next-count;
 if(next!=&values[1]||next.number!=7||previous!=ptr){return 1;}
 return 0;
}
`,
      expectedStdout: "",
    },
  ]);
}, 60000);
