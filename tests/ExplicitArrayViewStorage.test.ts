import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const [name, expression, declaration] of [
  ["local", "values", "local values:int[2]=[1,2];"],
  ["grouped", "((values))", "local values:int[2]=[1,2];"],
  ["alias", "values", "local values:Fixed=[1,2];"],
  ["field", "box.values", "local box:Box=Box{values:[1,2]};"],
  ["tuple", "pair.0", "local pair:(int[2],int)=([1,2],3);"],
  ["nested", "rows[0]", "local rows:int[2][2]=[[1,2],[3,4]];"],
  ["dereference", "*source(&values)", "local values:int[2]=[1,2];"],
]) {
  for (const destination of ["*int", "int[]"]) {
    test(`explicit ${destination} view borrows ${name} storage at O0/O3`, () => {
      expectCorrectnessSuite([
        {
          name: `explicit-view-${name}-${destination === "*int" ? "pointer" : "slice"}`,
          validateLlvm: true,
          source: `type Fixed=int[2];struct Box{values:int[2],}
global calls:int=0;
frame source(p:*Fixed)ret *Fixed{calls=calls+1;return p;}
frame main()ret int{${declaration}local view:${destination}=cast<${destination}>(${expression});view[1]=7;if((${expression === "*source(&values)" ? "values" : expression})[1]!=7||calls!=${name === "dereference" ? 1 : 0})return 1;return 0;}`,
          expectedStdout: "",
        },
      ]);
    }, 60000);
  }
}

test("explicit generic array views borrow caller storage and temporary views remain usable locally", () => {
  expectCorrectnessSuite([
    {
      name: "explicit-view-generic-and-temporary",
      validateLlvm: true,
      source: `type Pair<T>=T[2];
frame set<T>(p:*Pair<T>,first:T,second:T){local pointer:*T=cast<*T>(*p);pointer[0]=first;local view:T[]=cast<T[]>(*p);view[1]=second;}
frame make()ret int[2]{return [3,4];}
frame main()ret int{local a:int[2]=[1,2];set<int>(&a,7,8);local p:*int=cast<*int>(make());local v:int[]=cast<int[]>(true?[5,6]:[7,8]);if(a[0]!=7||a[1]!=8||p[1]!=4||v[1]!=6)return 1;return 0;}`,
      expectedStdout: "",
    },
  ]);
}, 60000);

for (const target of ["*int", "int[]"]) {
  for (const [declaration, source] of [
    ["local const a:int[2]=[1,2];", "a"],
    ["local const a:int[2]=[1,2];", "((a))"],
    ["local const box:Box=Box{values:[1,2]};", "box.values"],
    ["local const pair:(int[2],int)=([1,2],3);", "pair.0"],
    ["local const rows:int[2][2]=[[1,2],[3,4]];", "rows[0]"],
  ]) {
    test(`constant arrays cannot create a mutable ${target} view of ${source}`, () => {
      const checker = new TypeChecker({ collectAllErrors: true });
      checker.checkProgram(
        new Parser(
          `struct Box{values:int[2],}frame main()ret int{${declaration}local p:${target}=cast<${target}>(${source});p[0]=7;return 0;}`,
          "const-view.bpl",
        ).parse(),
      );
      expect(
        checker
          .getErrors()
          .some(
            (error) =>
              error.code === "BPL_CAST_INVALID" &&
              error.message.includes("constant array"),
          ),
      ).toBe(true);
    });
  }
}
