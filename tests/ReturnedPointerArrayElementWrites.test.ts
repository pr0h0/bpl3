import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const [name, expression] of [
  ["returned array", "make(&value)"],
  ["literal", "[&value,&value]"],
  ["conditional", "(true?[&value,&value]:[&value,&value])"],
  ["match", "(match(true){true=>[&value,&value],false=>[&value,&value],})"],
] as const) {
  test(`temporary ${name} pointer elements still refer to writable caller storage`, () => {
    expectCorrectnessSuite([
      {
        name: name.replaceAll(" ", "-"),
        validateLlvm: true,
        source: `frame make(p:*int)ret *int[2]{return [p,p];}
        frame main()ret int{
          local value:int=1;
          ${expression}[1][0]=7;
          local q:*int=&${expression}[0][0];*q=9;
          return value-9;
        }`,
      },
    ]);
  }, 60000);
}

for (const [name, declarations, setup, operation, result] of [
  [
    "generic row pointer",
    "type Row=int[2];type Pointer<T>=*T;type Rows<T>=T[2];frame make(p:Pointer<Row>)ret Rows<Pointer<Row>>{return [p,p];}",
    "local value:Row=[1,2];",
    "make(&value)[1][0]=7;",
    "value[0]-7",
  ],
  [
    "slice",
    "frame make(v:int[])ret int[2][]{return [v,v];}",
    "local value:int[2]=[1,2];",
    "make(value)[1][0]=7;",
    "value[0]-7",
  ],
  [
    "tuple pointer field",
    "frame make(p:*int)ret (int,*int)[2]{return [(1,p),(2,p)];}",
    "local value:int=1;",
    "make(&value)[0].1[0]=7;",
    "value-7",
  ],
  [
    "struct pointer field",
    "struct Box{p:*int,}frame make(p:*int)ret Box[2]{return [Box{p:p},Box{p:p}];}",
    "local value:int=1;",
    "make(&value)[1].p[0]=7;",
    "value-7",
  ],
] as const) {
  test(`temporary array ${name} values retain borrowed storage`, () => {
    expectCorrectnessSuite([
      {
        name: name.replaceAll(" ", "-"),
        validateLlvm: true,
        source: `${declarations}frame main()ret int{${setup}${operation}return ${result};}`,
      },
    ]);
  }, 60000);
}

test("temporary pointer bases and both indices evaluate once in source order", () => {
  expectCorrectnessSuite([
    {
      name: "temporary-pointer-base-order",
      validateLlvm: true,
      source: `global trace:int=0;
      frame make(p:*int)ret *int[2]{trace=1;return [p,p];}
      frame outer()ret int{trace=trace*10+2;return 1;}
      frame inner()ret int{trace=trace*10+3;return 1;}
      frame main()ret int{
        local values:int[2]=[1,2];
        make(&values[0])[outer()][inner()]+=5;
        if(trace!=123 || values[1]!=7)return 1;
        return 0;
      }`,
    },
  ]);
}, 60000);

for (const [name, declarations, operation, code] of [
  [
    "constant descriptor",
    "frame make(v:const int[])ret const int[2][]{return [v,v];}",
    "make(values)[0][0]=7;",
    "BPL_ASSIGNMENT_TARGET_INVALID",
  ],
  [
    "descriptor replacement",
    "frame make(v:int[])ret int[2][]{return [v,v];}",
    "make(values)[0]=values;",
    "BPL_ASSIGNMENT_TARGET_INVALID",
  ],
  [
    "descriptor address",
    "frame make(v:int[])ret int[2][]{return [v,v];}",
    "&make(values)[0];",
    "BPL_ADDRESS_OF_TARGET_INVALID",
  ],
] as const) {
  test(`temporary slice guard rejects ${name}`, () => {
    const source = `${declarations}frame main()ret int{local values:int[2]=[1,2];${operation}return 0;}`;
    const checker = new TypeChecker({ collectAllErrors: true });
    checker.checkProgram(
      new Parser(source, "temporary-slice-guard.bpl").parse(),
    );
    expect(checker.getErrors().some((error) => error.code === code)).toBe(true);
  });
}
