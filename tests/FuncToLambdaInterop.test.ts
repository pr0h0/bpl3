import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("Func arguments adapt the closure context when passed to Lambda parameters", () => {
  expectCorrectnessSuite([
    {
      name: "func-to-lambda-arguments",
      validateLlvm: true,
      source: `
    extern abs(x:int) ret int;
    type Callback<T>=Func<T>(T);
    frame increment(x:int) ret int {return x+1;}
    frame combine(x:int,y:int) ret int {return x*10+y;}
    frame factory() ret Callback<int> {return increment;}
    frame apply(f:Lambda<int>(int),x:int) ret int {return f(x);}
    frame apply_two(f:Lambda<int>(int,int)) ret int {return f(4,2);}
    frame generic<T>(f:Lambda<T>(T),x:T) ret T {return f(x);}
    frame main() ret int {
      if(apply(increment,41)!=42) return 1;
      local f:Callback<int>=increment;
      if(apply(f,41)!=42) return 2;
      if(apply(factory(),41)!=42) return 3;
      if(apply_two(combine)!=42) return 4;
      if(generic<int>(increment,41)!=42) return 5;
      if(apply(abs,-42)!=42) return 6;
      return 0;
    }
  `,
    },
  ]);
}, 60000);
