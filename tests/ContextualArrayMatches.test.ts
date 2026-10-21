import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

function diagnostics(source: string) {
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(new Parser(source, "array-matches.bpl").parse());
  return checker
    .getErrors()
    .map((error) => ({ code: error.code, message: error.message }));
}

const expression = "match(true){true=>[1,2],false=>[3,4],}";
for (const [label, source] of Object.entries({
  local: `frame main(){local values:u8[2]=${expression};values;}`,
  assignment: `frame main(){local values:u8[2];values=${expression};values;}`,
  returned: `frame make()ret u8[2]{return ${expression};}frame main(){make();}`,
  argument: `frame take(values:u8[2]){values;}frame main(){take(${expression});}`,
  grouped: `frame main(){local values:u8[2]=(((${expression})));values;}`,
  field: `struct Data{values:u8[2],}frame main(){local value:Data=Data{values:${expression}};value;}`,
  alias: `type Bytes=u8[2];frame main(){local values:Bytes=${expression};values;}`,
  generic: `frame take<T>(values:T[2]){values;}frame main(){take<u8>(${expression});}`,
  slice: `frame main(){local values:u8[]=${expression};values;}`,
  tuple:
    "frame main(){local values:(u8[2],u8)=match(true){true=>([1,2],3),false=>([4,5],6),};values;}",
  block:
    "frame main(){local values:u8[2]=match(true){true=>{return [1,2];},false=>{return [3,4];},};values;}",
  mixed:
    "frame main(){local values:u8[2]=match(true){true=>{if(true){return [1,2];}return [3,4];},false=>[5,6],};values;}",
  divergent:
    "frame main(){local values:u8[2]=match(true){true=>[1,2],false=>{throw 1;},};values;}",
  nested: `frame main(){local values:u8[2]=match(true){true=>${expression},false=>[5,6],};values;}`,
  guarded:
    "frame main(){local values:u8[2]=match(true){flag if flag=>[1,2],_=>[3,4],};values;}",
})) {
  test(`contextual match arrays: ${label}`, () =>
    expect(diagnostics(source)).toEqual([]));
}

for (const source of [
  "frame main(){local values:u8[2]=match(true){true=>[1,256],false=>[3,4],};values;}",
  "frame main(){local values:u8[2]=match(true){true=>{if(true){return [1,2];}return [3,256];},false=>[5,6],};values;}",
  `frame main(){local values:u8[3]=${expression};values;}`,
  "frame main(){local value:int=1;local values:u8[2]=match(true){true=>[value,2],false=>[3,4],};values;}",
  "frame main(){local old:int[2]=[1,2];local values:u8[2]=match(true){true=>old,false=>[3,4],};values;}",
  `frame main(){local values:bool[2]=${expression};values;}`,
  "frame main(){local values:(u8[2],u8)=match(true){true=>([1,2],256),false=>([3,4],5),};values;}",
]) {
  test(`contextual match arrays reject incompatible values: ${source}`, () =>
    expect(diagnostics(source).length).toBeGreaterThan(0));
}

test("contextual match array results lower consistently at O0/O3", () => {
  expectCorrectnessSuite([
    {
      name: "contextual-match-arrays",
      validateLlvm: true,
      source: `
import printf from "std/c.bpl";
type Pair=(u8[2],u8);
global calls:int=0;
frame flag(value:bool)ret bool{calls=calls+1;return value;}
frame make(value:bool)ret u8[2]{return match(flag(value)){true=>{return [1,2];},false=>[3,4],};}
frame pair(value:bool)ret Pair{return match(value){true=>([5,6],7),false=>{if(value){return ([8,9],10);}return ([11,12],13);},};}
frame sum<T>(values:T[2])ret int{return cast<int>(values[0])+cast<int>(values[1]);}
frame choose(values:u8[2])ret int{values;return 8;}
frame choose(values:int[2])ret int{values;return 32;}
frame wide(values:u8[2])ret int{values;return 8;}
frame wide(values:u16[2])ret int{return cast<int>(values[1]);}
frame main()ret int{
 local scalar:(u8[2],u16)=match(true){true=>([1,2],cast<u8>(255)+cast<u8>(1)),false=>([3,4],cast<u8>(2)),};
 local first:u8[2]=make(true);
 local second:u8[2]=make(false);
 local tuple:Pair=pair(false);
 local slice:u8[]=match(true){true=>[14,15],false=>[16,17],};
 local nested:u8[2]=match(true){true=>match(false){true=>[18,19],false=>[20,21],},false=>[22,23],};
 printf("%d %d %d %d %d %d %d %d %d %d\\n",sum<u8>(first),sum<u8>(second),sum<u8>(tuple.0),tuple.1,slice[1],sum<u8>(nested),choose(match(true){true=>[1,2],false=>[3,4],}),wide(match(false){true=>[1,2],false=>[3,300],}),scalar.1,calls);
 return 0;
}`,
      expectedStdout: "3 7 23 13 15 41 32 300 0 2\n",
    },
  ]);
}, 60000);

test("contextual arrays in enum, tuple and diverging matches lower at O0/O3", () => {
  expectCorrectnessSuite([
    {
      name: "contextual-match-kinds",
      validateLlvm: true,
      source: `enum Choice{A,B,}
frame enumValues(value:Choice)ret u8[2]{return match(value){Choice.A=>[1,2],Choice.B=>{return [3,4];},};}
frame tupleValues(value:bool)ret u8[2]{return match((value,1)){(true,_)=>[5,6],_=>[7,8],};}
frame diverging(value:bool)ret u8[2]{return match(value){true=>[9,10],false=>{throw 1;},};}
frame main()ret int{
 local a:u8[2]=enumValues(Choice.A);local b:u8[2]=enumValues(Choice.B);
 local c:u8[2]=tupleValues(true);local d:u8[2]=tupleValues(false);local e:u8[2]=diverging(true);
 if(a[1]!=cast<u8>(2)||b[1]!=cast<u8>(4)||c[1]!=cast<u8>(6)||d[1]!=cast<u8>(8)||e[1]!=cast<u8>(10)){return 1;}
 try{diverging(false);return 2;}catch(error:int){if(error!=1){return 3;}}
 return 0;
}`,
      expectedStdout: "",
    },
  ]);
}, 60000);
