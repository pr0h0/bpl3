import { expect, test } from "bun:test";
import { Compiler } from "../compiler";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("callback array literals preserve element signatures and dimensions", () => {
  expectCorrectnessSuite([
    {
      name: "callback-array-literals",
      validateLlvm: true,
      source: `
        type Callback<T>=Func<T>(T);
        frame inc(x:int) ret int {return x+1;}
        frame dec(x:int) ret int {return x-1;}
        frame second(fs:Callback<int>[2], x:int) ret int {return fs[1](x);}
        frame main() ret int {
          local direct:Func<int>(int)[2]=[inc,dec];
          local aliased:Callback<int>[2]=[dec,inc];
          local nested:Callback<int>[2][2]=[[inc,dec],[dec,inc]];
          if(direct[0](41)!=42 || direct[1](43)!=42) return 1;
          if(aliased[1](41)!=42 || second([inc,dec],43)!=42) return 2;
          if(nested[0][1](43)!=42 || nested[1][1](41)!=42) return 3;
          return 0;
        }
      `,
    },
  ]);
}, 60000);

test("callback array literals reject inconsistent callback signatures", () => {
  const result = new Compiler({ filePath: "callbacks.bpl" }).compile(`
    frame inc(x:int) ret int {return x+1;}
    frame other(x:int,y:int) ret int {return x+y;}
    frame main() ret int {
      local fs:Func<int>(int)[2]=[inc,other];
      return 0;
    }
  `);
  expect(result.success).toBe(false);
  expect(
    result.errors?.some(
      (e) => e.code === "BPL_ARRAY_LITERAL_TYPE_MISMATCH",
    ),
  ).toBe(true);
});

test("tuple and closure array literals retain their element types", () => {
  expectCorrectnessSuite([
    {
      name: "tuple-closure-array-literals",
      validateLlvm: true,
      source: `
        frame main() ret int {
          local offset:int=40;
          local add:Lambda<int>(int)=|x:int| ret int {return offset+x;};
          local subtract:Lambda<int>(int)=|x:int| ret int {return offset-x;};
          local callbacks:Lambda<int>(int)[2]=[add,subtract];
          local pairs:(int,int)[2]=[(20,22),(40,2)];
          if(callbacks[0](2)!=42 || callbacks[1](2)!=38) return 1;
          if(pairs[0].0+pairs[0].1!=42 || pairs[1].0+pairs[1].1!=42) return 2;
          return 0;
        }
      `,
    },
  ]);
}, 60000);
