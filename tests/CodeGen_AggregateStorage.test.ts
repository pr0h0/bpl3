import { test } from "bun:test";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";
test("enum payloads preserve nested array aliases, generic fields, alignment and reflection", () => {
  expectCorrectnessSuite([
    {
      name: "aggregate-storage",
      validateLlvm: true,
      source: `import [TypeInfo] from "std/reflection.bpl";import printf from "std/c.bpl";extern sqrt(x:float) ret float;
type Words=int[9];type Doubles=float[3];
struct Data {a:Words,b:Doubles,c:char,}
struct Small {a:char,b:char,c:char,}
enum Value<T> {Some(T,char),None,}
enum Aligned {Data(char,Small,long,Data),Empty,}
frame main() ret int {
 local data:Data;loop(local i:int=0;i<9;i=i+1) {data.a[i]=i;}loop(local i:int=0;i<3;i=i+1) {data.b[i]=0.0;}data.a[8]=123;data.b[2]=2.5;data.c='z';
 local small:Small=Small{a:'a',b:'b',c:'c'};
 local value:Value<Data>=Value<Data>.Some(data,'x');
 match(value) {Value.Some(d,c)=>{if(d.a[8]!=123 || d.b[2]!=2.5 || d.c!='z' || c!='x') {throw "bad generic payload";}},Value.None=>{throw "missing generic payload";}}
 local aligned:Aligned=Aligned.Data('t',small,cast<long>(5000000000),data);
 match(aligned) {Aligned.Data(c,s,n,d)=>{if(c!='t' || s.c!='c' || n!=cast<long>(5000000000) || d.a[8]!=123 || d.c!='z') {throw "bad aligned payload";}},Aligned.Empty=>{throw "missing aligned payload";}}
 local info:*TypeInfo=typeof<Value<Data>>();if(info.size!=sizeof<Value<Data>>()) {return 5;}
 if(sizeof<Data>()!=72 || sizeof<Value<Data>>()!=88 || sizeof<Aligned>()!=96) {return 6;}
 local copies:Aligned[2];copies[0]=aligned;copies[1]=aligned;
 if(copies[0]!=copies[1]) {return 7;}
 data.b[0]=-0.0;copies[1]=Aligned.Data('t',small,cast<long>(5000000000),data);
 if(copies[0]!=copies[1]) {return 8;}
 data.b[1]=sqrt(-1.0);copies[1]=Aligned.Data('t',small,cast<long>(5000000000),data);
 if(copies[1]==copies[1]) {return 9;}
 printf("aggregate storage passed\\n");return 0;
}`,
      expectedStdout: "aggregate storage passed\n",
    },
  ]);
}, 60000);
