import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const [name, source] of [
  [
    "callback",
    `frame identity(x:int)ret int{return x;}
    frame other(x:int)ret int{return x+1;}
    frame make(v:const Func<int>(int)[])ret const Func<int>(int)[2][]{return [v,v];}
    frame main()ret int{local values:Func<int>(int)[2]=[identity,identity];make(values)[0][0]=other;return 0;}`,
  ],
  [
    "tuple",
    `frame make(v:const (int,int)[])ret const (int,int)[2][]{return [v,v];}
    frame main()ret int{local values:(int,int)[2]=[(1,2),(3,4)];make(values)[0][0]=(7,8);return 0;}`,
  ],
  [
    "closure",
    `frame make(v:const Lambda<int>(int)[])ret const Lambda<int>(int)[2][]{return [v,v];}
    frame main()ret int{local values:Lambda<int>(int)[2];local callback:Lambda<int>(int);make(values)[0][0]=callback;return 0;}`,
  ],
] as const) {
  test(`temporary slice guard rejects constant ${name} descriptor`, () => {
    const checker = new TypeChecker({ collectAllErrors: true });
    checker.checkProgram(
      new Parser(source, "constant-aggregate-slice.bpl").parse(),
    );
    expect(
      checker
        .getErrors()
        .some((error) => error.code === "BPL_ASSIGNMENT_TARGET_INVALID"),
    ).toBe(true);
  });
}

test("mutable callback and tuple slice descriptors still borrow writable storage", () => {
  expectCorrectnessSuite([
    {
      name: "mutable-aggregate-slice-descriptors",
      validateLlvm: true,
      source: `frame identity(x:int)ret int{return x;}
      frame other(x:int)ret int{return x+1;}
      frame callbacks(v:Func<int>(int)[])ret Func<int>(int)[2][]{return [v,v];}
      frame pairs(v:(int,int)[])ret (int,int)[2][]{return [v,v];}
      frame main()ret int{
        local funcs:Func<int>(int)[2]=[identity,identity];
        callbacks(funcs)[0][1]=other;if(funcs[1](4)!=5)return 1;
        local values:(int,int)[2]=[(1,2),(3,4)];
        pairs(values)[0][1]=(7,8);
        if(values[1].0!=7 || values[1].1!=8)return 2;
        return 0;
      }`,
    },
  ]);
}, 60000);

for (const [name, source] of [
  [
    "callback",
    `type Fixed=const Func<int>(int)[2];
    frame identity(x:int)ret int{return x;}
    frame main(){local values:Fixed=[identity,identity];cast<Func<int>(int)[]>(values);}`,
  ],
  [
    "tuple",
    `type Fixed=const (int,int)[2];
    frame main(){local values:Fixed=[(1,2),(3,4)];cast<(int,int)[]>(values);}`,
  ],
  [
    "closure",
    `type Fixed=const Lambda<int>(int)[2];
    frame main(){local values:Fixed;cast<Lambda<int>(int)[]>(values);}`,
  ],
] as const) {
  test(`constant ${name} arrays cannot produce mutable slice casts`, () => {
    const checker = new TypeChecker({ collectAllErrors: true });
    checker.checkProgram(
      new Parser(source, "constant-aggregate-cast.bpl").parse(),
    );
    expect(
      checker.getErrors().some((error) => error.code === "BPL_CAST_INVALID"),
    ).toBe(true);
  });
}
