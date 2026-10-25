import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

const declarations = `type Fixed=int[2];
struct Box{values:int[2],}
frame array()ret int[2]{return [1,2];}
frame aliased()ret Fixed{return [1,2];}
frame tuple()ret (int[2],int){return ([1,2],3);}
frame box()ret Box{return Box{values:[1,2]};}
frame choose<T>(value:T)ret T{return value;}
frame rows()ret int[2][2]{return [[1,2],[3,4]];}`;
for (const element of [
  "array()[0]",
  "((aliased()))[0]",
  "tuple().0[0]",
  "box().values[0]",
  "choose<Fixed>([1,2])[0]",
  "rows()[0][0]",
  "[1,2][0]",
  "(true?[1,2]:[3,4])[0]",
  "(match(true){true=>[1,2],false=>[3,4],})[0]",
]) {
  for (const [operation, statement] of [
    ["assignment", `${element}=7;return 0;`],
    ["compound", `${element}+=7;return 0;`],
    ["increment", `${element}++;return 0;`],
    ["address", `local p:*int=&${element};return *p;`],
  ]) {
    test(`rejects ${operation} of temporary owned array element: ${element}`, () => {
      const source = declarations + `frame main()ret int{${statement}}`;
      const checker = new TypeChecker({ collectAllErrors: true });
      const ast = new Parser(source, "temporary-writes.bpl").parse();
      checker.checkProgram(ast);
      const errors = checker.getErrors();
      expect(
        errors.some(
          (error) =>
            error.code ===
            (operation === "address"
              ? "BPL_ADDRESS_OF_TARGET_INVALID"
              : "BPL_ASSIGNMENT_TARGET_INVALID"),
        ),
      ).toBe(true);
    });
  }
}

test("writes through returned slices, pointers and stored fixed arrays retain single evaluation", () => {
  expectCorrectnessSuite([
    {
      name: "stored-array-and-borrowed-index-writes",
      validateLlvm: true,
      source: `struct Box{values:int[2],}
global calls:int=0;
frame view(v:int[])ret int[]{calls=calls+1;return v;}
frame pointer(v:*int)ret *int{calls=calls+1;return v;}
frame object(v:*Box)ret *Box{calls=calls+1;return v;}
frame main()ret int{local a:int[2]=[1,2];local box:Box=Box{values:[3,4]};view(a)[0]=5;pointer(&a[0])[1]+=4;object(&box).values[0]++;local p:*int=&view(a)[1];local q:*int=&pointer(&a[0])[0];if(a[0]!=5||a[1]!=6||box.values[0]!=4||*p!=6||*q!=5||calls!=5)return 1;((a))[0]=9;return a[0]-9;}`,
      expectedStdout: "",
    },
  ]);
}, 60000);

for (const [name, declarations, element] of [
  [
    "plain pointer array",
    "frame make(p:*int)ret *int[2]{return [p,p];}",
    "make(nullptr)[0]",
  ],
  [
    "aliased pointer array",
    "type Pointers=*int[2];frame make(p:*int)ret Pointers{return [p,p];}",
    "make(nullptr)[0]",
  ],
  [
    "generic pointer array",
    "type Pair<T>=T[2];frame make<T>(p:T)ret Pair<T>{return [p,p];}",
    "make<*int>(nullptr)[0]",
  ],
]) {
  for (const operation of ["assignment", "address"]) {
    test(`temporary ${name} rejects ${operation}`, () => {
      const statement =
        operation === "assignment"
          ? `${element}=nullptr;return 0;`
          : `local p:**int=&${element};return 0;`;
      const checker = new TypeChecker({ collectAllErrors: true });
      checker.checkProgram(
        new Parser(
          `${declarations}frame main()ret int{${statement}}`,
          "pointer-arrays.bpl",
        ).parse(),
      );
      expect(
        checker
          .getErrors()
          .some(
            (error) =>
              error.code ===
              (operation === "assignment"
                ? "BPL_ASSIGNMENT_TARGET_INVALID"
                : "BPL_ADDRESS_OF_TARGET_INVALID"),
          ),
      ).toBe(true);
    });
  }
}

test("returned pointers to array aliases and pointees from pointer-array values remain writable", () => {
  expectCorrectnessSuite([
    {
      name: "array-pointer-storage-order",
      validateLlvm: true,
      source: `type Fixed=int[2];type Pointers=*int[2];
global calls:int=0;
frame fixed(p:*Fixed)ret *Fixed{calls=calls+1;return p;}
frame pointers(p:*int)ret Pointers{calls=calls+1;return [p,p];}
frame main()ret int{local a:Fixed=[1,2];fixed(&a)[1]=7;local x:int=3;*pointers(&x)[0]=9;if(a[1]!=7||x!=9||calls!=2)return 1;return 0;}`,
      expectedStdout: "",
    },
  ]);
}, 60000);
