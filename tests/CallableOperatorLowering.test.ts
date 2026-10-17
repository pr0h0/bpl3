import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("callable operators use specialized method argument and return lowering", () => {
  expectCorrectnessSuite([
    {
      name: "callable-method-lowering",
      validateLlvm: true,
      source: `struct Callable<T>{
 value:T,
 frame __call__(this:*Callable<T>,x:T)ret T{return x;}
}
struct Sink{
 value:int,
 frame __call__(this:*Sink,x:u8){this.value=cast<int>(x);}
}
global calls:int=0;
global sink:*Sink;
frame receiver()ret *Sink{calls=calls+1;return sink;}
frame main()ret int{
 local target:Sink;
 sink=&target;
 local callable:Callable<u8>;
 local value:u8=callable(255);
 if(value!=cast<u8>(255)||callable(cast<u8>(300))!=cast<u8>(44)){return 1;}
 local pointer:*Callable<u8>=&callable;
 if(pointer(254)!=cast<u8>(254)){return 2;}
 receiver()(17);
 if(calls!=1||sink.value!=17){return 3;}
 return 0;
}`,
      expectedStdout: "",
    },
  ]);
}, 60000);
