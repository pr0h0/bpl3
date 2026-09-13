import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";
test("user frames and local callables retain intrinsic-like names", () => {
  expectCorrectnessSuite([
    {
      name: "intrinsic-shadowing",
      validateLlvm: true,
      source: `import [Math] from "std"; import printf from "std/c.bpl";
frame log(level:string,message:string) {printf("%s: %s\\n",level,message);}
frame sqrt(x:int) ret int {return x+10;}
frame memcpy(x:int) ret int {return x+20;}
frame answer(x:int) ret int {return x+30;}
frame main() ret int {
 log("info","user function");
 if(sqrt(2)!=12 || memcpy(2)!=22 || Math.sqrt(4.0)!=2.0) {return 1;}
 local cos:Func<int>(int)=answer;if(cos(2)!=32) {return 2;}
 return 0;
}`,
      expectedStdout: "info: user function\n",
    },
  ]);
}, 60000);
test("Func-to-Lambda adapters handle locals, zero arguments, void and aggregate returns", () => {
  expectCorrectnessSuite([
    {
      name: "function-adapters",
      validateLlvm: true,
      source: `import printf from "std/c.bpl";
struct Pair {x:int,y:int,}
frame add(a:int,b:int) ret int {return a+b;}
frame value() ret long {return cast<long>(5000000000);}
frame output() {printf("called\\n");}
frame pair(x:int) ret Pair {return Pair{x:x,y:x+1};}
frame main() ret int {
 local f:Func<int>(int,int)=add;local g:Lambda<int>(int,int)=cast<Lambda<int>(int,int)>(f);
 if(g(2,3)!=5) {return 1;}
 local v:Func<long>()=value;local vl:Lambda<long>()=cast<Lambda<long>()>(v);if(vl()!=cast<long>(5000000000)) {return 2;}
 local o:Func<void>()=output;local ol:Lambda<void>()=cast<Lambda<void>()>(o);ol();
 local p:Func<Pair>(int)=pair;local pl:Lambda<Pair>(int)=cast<Lambda<Pair>(int)>(p);
 local result:Pair=pl(4);if(result.x!=4 || result.y!=5) {return 3;}
 local ignored:Lambda<int>(int,int)=|_:int,_:int| ret int {return 7;};if(ignored(3,4)!=7) {return 4;}
 return 0;
}`,
      expectedStdout: "called\n",
    },
  ]);
}, 60000);
