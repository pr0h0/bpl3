import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

/** Collect diagnostics from complete source programs without generating code. */
function diagnostics(source: string) {
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(new Parser(source, "mixed-array-match.bpl").parse());
  return checker.getErrors().map((e) => ({ code: e.code, message: e.message }));
}
const expression = "match(true){true=>old,false=>[3,4],}";
for (const [name, source] of Object.entries({
  local: `frame main(){local old:u8[2]=[1,2];local result:u8[2]=${expression};result;}`,
  reverse:
    "frame main(){local old:u8[2]=[1,2];local result:u8[2]=match(true){true=>[3,4],false=>old,};result;}",
  assignment: `frame main(){local old:u8[2]=[1,2];local result:u8[2];result=${expression};result;}`,
  returned: `frame make(old:u8[2])ret u8[2]{return ${expression};}`,
  argument: `frame take(v:u8[2]){v;}frame main(){local old:u8[2]=[1,2];take(${expression});}`,
  alias: `type Bytes=u8[2];frame main(){local old:Bytes=[1,2];local result:Bytes=${expression};result;}`,
  field: `struct Box{v:u8[2],}frame main(){local old:u8[2]=[1,2];local result:Box=Box{v:${expression}};result;}`,
  generic: `frame take<T>(v:T[2]){v;}frame main(){local old:u8[2]=[1,2];take<u8>(${expression});}`,
  grouped: `frame main(){local old:u8[2]=[1,2];local result:u8[2]=(((${expression})));result;}`,
  nested: `frame main(){local old:u8[2]=[1,2];local result:u8[2]=match(true){true=>old,false=>match(false){true=>[3,4],false=>[5,6],},};result;}`,
  block:
    "frame make(old:u8[2],flag:bool)ret u8[2]{return match(true){true=>{if(flag){return old;}return [3,4];},false=>[5,6],};}",
  blockReverse:
    "frame make(old:u8[2],flag:bool)ret u8[2]{return match(true){true=>{if(flag){return [3,4];}return old;},false=>old,};}",
  tuple:
    "frame main(){local old:(u8[2],u8)=([1,2],3);local result:(u8[2],int)=match(true){true=>old,false=>([4,5],256),};result;}",
  nestedTuple:
    "frame main(){local old:(u8[2],u8)=([1,2],3);local result:(u8[2],int)=match(true){true=>old,false=>match(false){true=>([4,5],256),false=>([6,7],257),},};result;}",
})) {
  test(`mixed stored/literal match arrays: ${name}`, () =>
    expect(diagnostics(source)).toEqual([]));
}

for (const source of [
  "frame main(){local old:u8[2]=[1,2];local result:u8[2]=match(true){true=>old,false=>[3,256],};result;}",
  "frame main(){local old:u8[2]=[1,2];local result:u8[2]=match(true){true=>old,false=>[3,4,5],};result;}",
  "frame main(){local old:u8[2]=[1,2];local n:int=3;local result:u8[2]=match(true){true=>old,false=>[n,4],};result;}",
  "frame main(){local old:u8[2]=[1,2];local other:int[2]=[3,4];local result:u8[2]=match(true){true=>old,false=>other,};result;}",
  "frame main(){local old:bool[2]=[true,false];local result:bool[2]=match(true){true=>old,false=>[1,2],};result;}",
]) {
  test(`mixed array matches reject incompatible values: ${source}`, () =>
    expect(diagnostics(source).length).toBeGreaterThan(0));
}

test("mixed array matches retain returned-view lifetime checks", () => {
  const source = `frame bad(old:u8[2])ret u8[]{return ${expression};}`;
  expect(
    diagnostics(source).some((e) => e.code === "BPL_RETURN_ARRAY_VIEW_ESCAPES"),
  ).toBe(true);
});

test("mixed array match values lower once without narrowing tuple arithmetic at O0/O3", () => {
  expectCorrectnessSuite([
    {
      name: "mixed-stored-array-matches",
      validateLlvm: true,
      source: `global calls:int=0;
frame flag(v:bool)ret bool{calls=calls+1;return v;}
frame choose(old:u8[2],v:bool)ret u8[2]{return match(flag(v)){true=>old,false=>{return [3,4];},};}
frame sum<T>(v:T[2])ret int{return cast<int>(v[0])+cast<int>(v[1]);}
frame main()ret int{
 local old:u8[2]=[1,2];local a:u8[2]=choose(old,true);local b:u8[2]=choose(old,false);
 a[0]=cast<u8>(9);if(old[0]!=cast<u8>(1)||b[1]!=cast<u8>(4)||calls!=2){return 1;}
 if(sum<u8>(match(false){true=>old,false=>[5,6],})!=11){return 2;}
 local pair:(u8[2],u8)=(old,7);
 local n:int=calls+254;
 local mixed:(u8[2],int)=match(false){true=>pair,false=>([8,9],n),};
 if(mixed.0[1]!=cast<u8>(9)||mixed.1!=256){return 3;}
 local same:(u8[2],int)=match(true){true=>pair,false=>([8,9],256),};
 if(same.1!=7){return 4;}
 local nested:(u8[2],int)=match(false){true=>pair,false=>match(flag(true)){true=>([10,11],256),false=>([12,13],257),},};
 if(nested.1!=256||nested.0[1]!=cast<u8>(11)||calls!=3){return 6;}
 local ints:int[2]=[1,2];local widened:int[2]=match(false){true=>ints,false=>[cast<u8>(255)+cast<u8>(1),cast<u8>(2)],};
 if(widened[0]!=0||widened[1]!=2){return 5;}return 0;
}`,
      expectedStdout: "",
    },
  ]);
}, 60000);
