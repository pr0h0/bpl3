import { test } from "bun:test";
import {
  expectCorrectnessSuite,
  expectRuntimeFailureSuite,
} from "./helpers/compilerCorrectness";
import { expectCheckDiagnostics } from "./helpers/languageSpec";

test("callback slices view fixed array storage and preserve nested dimensions", () => {
  expectCorrectnessSuite([
    {
      name: "callback-slices",
      validateLlvm: true,
      source: `
    type Callback<T>=Func<T>(T); type View<T>=T[];
    frame inc(x:int) ret int {return x+1;}
    frame dec(x:int) ret int {return x-1;}
    frame call(fs:Callback<int>[],i:int,x:int) ret int {return fs[i](x);}
    frame replace(fs:View<Callback<int>>) {fs[1]=inc;}
    frame row(fs:Callback<int>[][2]) ret int {return fs[1][0](43);}
    frame main() ret int {
      local fs:Callback<int>[2]=[inc,dec];
      local view:Callback<int>[]=fs;
      if(call(fs,1,43)!=42 || call(view,0,41)!=42) return 1;
      replace(fs);if(fs[1](41)!=42) return 2;
      local other:Callback<int>[3]=[dec,inc,dec];view=other;
      view[2]=inc;if(other[2](41)!=42) return 3;
      if(call([inc,dec],1,43)!=42) return 4;
      local rows:Callback<int>[2][2]=[[inc,dec],[dec,inc]];
      if(row(rows)!=42) return 5;
      return 0;
    }`,
    },
  ]);
}, 60000);

test("callback slices enforce dynamic bounds", () => {
  expectRuntimeFailureSuite([
    {
      name: "callback-slice-bounds",
      expectedMessage: "INDEX OUT OF BOUNDS",
      source: `
    frame inc(x:int) ret int {return x+1;}
    frame call(fs:Func<int>(int)[],i:int) ret int {return fs[i](41);}
    frame main() ret int {local fs:Func<int>(int)[2]=[inc,inc];return call(fs,2);}
  `,
    },
  ]);
}, 60000);

test("callback arrays reject incompatible shapes and scalar callback uses", () => {
  expectCheckDiagnostics([
    {
      name: "callback-row-width",
      code: "BPL_CALL_ARGUMENT_TYPE_MISMATCH",
      source: `
      frame accept(fs:Func<int>(int)[][2]) ret int {return fs[0][0](1);}
      frame main() {local fs:Func<int>(int)[2][3];accept(fs);}
    `,
    },
    {
      name: "callback-array-scalar",
      code: "BPL_CALL_ARGUMENT_TYPE_MISMATCH",
      source: `
      frame accept(f:Func<int>(int)) ret int {return f(1);}
      frame main() {local fs:Func<int>(int)[2];accept(fs);}
    `,
    },
    {
      name: "callback-array-signature",
      code: "BPL_CALL_ARGUMENT_TYPE_MISMATCH",
      source: `
      frame accept(fs:Func<long>(long)[]) ret long {return fs[0](1);}
      frame main() {local fs:Func<int>(int)[2];accept(fs);}
    `,
    },
    {
      name: "callback-array-closure",
      code: "BPL_CALL_ARGUMENT_TYPE_MISMATCH",
      source: `
      frame accept(fs:Lambda<int>(int)[]) ret int {return fs[0](1);}
      frame main() {local fs:Func<int>(int)[2];accept(fs);}
    `,
    },
    {
      name: "callback-slice-fixed",
      code: "BPL_CALL_ARGUMENT_TYPE_MISMATCH",
      source: `
      frame accept(fs:Func<int>(int)[2]) ret int {return fs[0](1);}
      frame bad(fs:Func<int>(int)[]) {accept(fs);}
    `,
    },
  ]);
});

test("closure and tuple slices retain captures and view original storage", () => {
  expectCorrectnessSuite([
    {
      name: "closure-tuple-slices",
      validateLlvm: true,
      source: `
    frame call(fs:Lambda<int>(int)[]) ret int {return fs[0](2);}
    frame sum(ps:(int,int)[]) ret int {return ps[1].0+ps[1].1;}
    frame main() ret int {
      local offset:int=40;
      local add:Lambda<int>(int)=|x:int| ret int {return offset+x;};
      local sub:Lambda<int>(int)=|x:int| ret int {return offset-x;};
      local fs:Lambda<int>(int)[2]=[add,sub];
      local view:Lambda<int>(int)[]=fs;
      view[1]=add;if(fs[1](2)!=42 || call(fs)!=42) return 1;
      local pairs:(int,int)[2]=[(20,22),(40,2)];
      local tuples:(int,int)[]=pairs;
      tuples[1]=(30,12);if(sum(pairs)!=42 || pairs[1].0!=30) return 2;
      local other:int[2]=[1,2];local scalars:int[]=other;
      local replacement:int[3]=[3,4,5];scalars=replacement;
      scalars[2]=42;if(replacement[2]!=42) return 3;
      return 0;
    }
  `,
    },
  ]);
}, 60000);
