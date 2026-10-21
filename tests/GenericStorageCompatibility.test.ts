import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const source of [
  "enum Box<T>{Value(T),}frame bad()ret Box<int[]>{return Box.Value([1,2]);}",
  "enum Box<T>{Value(T),}frame bad()ret Box<int[]>{return ((Box.Value([1,2])));}",
  "enum Box<T>{Value(T),}type ViewBox=Box<int[]>;frame bad()ret ViewBox{return Box.Value([1,2]);}",
  "enum Box<T>{Value(T),}frame bad()ret (Box<int[]>,int){return (Box.Value([1,2]),3);}",
  "enum Box<T>{Value(T),}frame bad()ret Box<int[]>{return match(true){true=>Box.Value([1,2]),false=>{return Box.Value([3,4]);},};}",
  "enum Box<T>{Value(T),}frame bad(v:Box<int[2]>)ret Box<int[]>{return v;}",
  "enum Box<T>{Value(T),}frame bad(v:Box<u8>)ret Box<int>{return v;}",
  "struct Box<T>{v:T,}frame bad(v:Box<int[2]>)ret Box<int[]>{return v;}",
  "struct Box<T>{v:T,}frame bad(v:Box<u8>)ret Box<int>{return v;}",
  "struct Box<T>{v:T,}frame main(){local a:Box<int[]>=Box<int[2]>{v:[1,2]};a;}",
  "struct Box<T>{v:T,}frame take(v:Box<int[]>){v;}frame main(){local a:Box<int[2]>=Box<int[2]>{v:[1,2]};take(a);}",
  "struct Box<T>{v:T,}frame bad(v:Box<Box<int[2]>>)ret Box<Box<int[]>>{return v;}",
  "struct Box<T>{v:T,}frame bad(v:Box<*int>)ret Box<*void>{return v;}",
]) {
  test(`generic storage rejects incompatible instantiations: ${source}`, () => {
    const checker = new TypeChecker({ collectAllErrors: true });
    checker.checkProgram(new Parser(source, "generic-storage.bpl").parse());
    expect(checker.getErrors().length).toBeGreaterThan(0);
  });
}

test("generic storage preserves aliases and inferred array values at O0/O3", () => {
  expectCorrectnessSuite([
    {
      name: "generic-storage-compatible",
      validateLlvm: true,
      source: `struct Box<T>{v:T,}
type Word=i32;
enum Wrapped<T>{Value(T),}
frame copy(v:Box<Word>)ret Box<int>{return v;}
frame saved(v:int[2])ret Wrapped<int[2]>{return Wrapped.Value(v);}
frame main()ret int{local b:Box<int>=copy(Box<Word>{v:7});if(b.v!=7){return 1;}return match(saved([3,4])){Wrapped.Value(values)=>values[1]-4,};}`,
      expectedStdout: "",
    },
  ]);
}, 60000);
