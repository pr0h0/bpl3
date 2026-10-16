import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

test("Rational normalizes reduced signs or returns its invalid sentinel", () => {
  expectCorrectnessSuite([
    {
      name: "rational-sign-bounds",
      validateLlvm: true,
      source: `import [Rational] from "std/rational.bpl";
extern printf(format:string,...)ret int;
frame main(){
 local minimum:long=cast<long>(-9223372036854775808);
 local numerators:long[8]=[cast<long>(1),minimum,minimum,minimum,cast<long>(2),minimum,cast<long>(0),cast<long>(-1)];
 local denominators:long[8]=[minimum,cast<long>(-1),cast<long>(-2),minimum,minimum,cast<long>(1),minimum,minimum];
 loop(local i:int=0;i<8;i=i+1){local value:Rational=Rational.new(numerators[i],denominators[i]);printf("%d %ld/%ld\\n",value.isValid(),value.num,value.den);}
}`,
      expectedStdout:
        "0 0/0\n0 0/0\n1 4611686018427387904/1\n1 1/1\n1 -1/4611686018427387904\n1 -9223372036854775808/1\n1 0/1\n0 0/0\n",
    },
  ]);
}, 60000);
