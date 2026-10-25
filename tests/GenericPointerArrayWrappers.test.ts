import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

const prefix = `type Row=int[2];type Pointer<T>=*T;type Rows<T>=T[2];
  type Chain<T>=Rows<T>;type View<T>=T[];type Alias=Pointer<Row>;
  struct Holder<T>{items:T[2],}
  frame main()ret int{
    local first:Row=[1,2];local second:Row=[3,4];`;

for (const [name, type] of [
  ["generic array wrapper", "Rows<Pointer<Row>>"],
  ["generic alias chain", "Chain<Pointer<Row>>"],
  ["direct array wrapper", "Pointer<Row>[2]"],
  ["nongeneric alias wrapper", "Alias[2]"],
  ["direct slice wrapper", "Pointer<Row>[]"],
  ["generic slice wrapper", "View<Pointer<Row>>"],
] as const) {
  test(`generic pointer elements retain array storage: ${name}`, () => {
    expectCorrectnessSuite([
      {
        name: name.replaceAll(" ", "-"),
        validateLlvm: true,
        source:
          prefix +
          `
        local values:${type}=[&first,&second];
        if(values[1][1]!=4)return 1;
        values[0][1]=7;if(first[1]!=7)return 2;
        values[1]=&first;if(values[1][0]!=1)return 3;
        return 0;
      }`,
      },
    ]);
  }, 60000);
}

test("generic pointer array fields retain row pointees", () => {
  expectCorrectnessSuite([
    {
      name: "generic-pointer-array-field",
      validateLlvm: true,
      source:
        prefix +
        `
      local value:Holder<Pointer<Row>>=Holder<Pointer<Row>>{items:[&first,&second]};
      if(value.items[1][1]!=4)return 1;
      value.items[0][1]=9;if(first[1]!=9)return 2;
      return 0;
    }`,
    },
  ]);
}, 60000);

test("actual generic outer pointers retain pointer indirection", () => {
  expectCorrectnessSuite([
    {
      name: "generic-outer-array-pointer-controls",
      validateLlvm: true,
      source: `type Row=int[2];type Pointer<T>=*T;
      frame main()ret int{
        local row:Row=[5,6];local p:Pointer<Row>=&row;
        if(p[1]!=6)return 1;p[0]=7;if(row[0]!=7)return 2;
        return 0;
      }`,
    },
  ]);
}, 60000);

test("wrapped pointer arrays preserve borrowed views and returned values", () => {
  expectCorrectnessSuite([
    {
      name: "wrapped-pointer-array-views",
      validateLlvm: true,
      source: `type Row=int[2];type Pointer<T>=*T;type Rows<T>=T[2];
      frame make(a:Pointer<Row>,b:Pointer<Row>)ret Rows<Pointer<Row>>{return [a,b];}
      frame main()ret int{
        local first:Row=[1,2];local second:Row=[3,4];
        local values:Rows<Pointer<Row>>=[&first,&second];
        local view:Pointer<Row>[]=values;
        local explicit:Pointer<Row>[]=cast<Pointer<Row>[]>(values);
        view[1]=&first;if(values[1][1]!=2)return 1;
        explicit[0][1]=8;if(first[1]!=8)return 2;
        local returned:Rows<Pointer<Row>>=make(&first,&second);
        if(returned[1][0]!=3)return 3;
        local whole:Pointer<Rows<Pointer<Row>>>=&values;
        if(whole[1][1]!=8)return 4;
        return 0;
      }`,
    },
  ]);
}, 60000);

for (const [name, code, body] of [
  [
    "scalar cast",
    "BPL_CAST_INVALID",
    "frame bad(a:Rows<Pointer<Row>>){cast<long>(a);}",
  ],
  [
    "temporary element assignment",
    "BPL_ASSIGNMENT_TARGET_INVALID",
    "frame bad(p:Pointer<Row>){make(p,p)[0]=p;}",
  ],
  [
    "temporary element address",
    "BPL_ADDRESS_OF_TARGET_INVALID",
    "frame bad(p:Pointer<Row>){&make(p,p)[0];}",
  ],
] as const) {
  test(`wrapped pointer arrays reject ${name}`, () => {
    const source = `type Row=int[2];type Pointer<T>=*T;type Rows<T>=T[2];
      frame make(a:Pointer<Row>,b:Pointer<Row>)ret Rows<Pointer<Row>>{return [a,b];}
      ${body}`;
    const checker = new TypeChecker({ collectAllErrors: true });
    checker.checkProgram(
      new Parser(source, "generic-pointer-wrappers.bpl").parse(),
    );
    expect(checker.getErrors().some((error) => error.code === code)).toBe(true);
  });
}
