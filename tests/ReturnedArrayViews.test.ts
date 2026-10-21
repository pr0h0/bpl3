import { expect, test } from "bun:test";
import { spawnSync } from "child_process";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";
import { Parser } from "../compiler/frontend/Parser";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

for (const source of [
  "frame borrow(v:int[])ret int[]{return v;}frame bad()ret int[]{return borrow([1,2]);}",
  "frame borrow(v:*int)ret *int{return v;}frame bad()ret *int{return borrow([1,2]);}",
  "frame borrow(v:u8[])ret u8[]{return v;}frame bad()ret u8[]{return borrow(match(true){true=>[1,2],false=>[3,4],});}",
  "struct Box<T>{v:T,}frame wrap<T>(v:T)ret Box<T>{return Box<T>{v:v};}frame bad()ret Box<int[]>{return wrap<int[]>([1,2]);}",
  "frame borrow(v:int[])ret int[]{return v;}frame bad(f:Func<int[]>(int[]))ret int[]{return f([1,2]);}",
  "frame bad(f:Lambda<int[]>(int[]))ret int[]{return f([1,2]);}",
  "struct Borrower{frame borrow(this:Borrower,v:int[])ret int[]{return v;}}frame bad(b:Borrower)ret int[]{return b.borrow([1,2]);}",
  "struct Borrower{frame __call__(this:Borrower,v:int[])ret int[]{return v;}}frame bad(b:Borrower)ret int[]{return b([1,2]);}",
  "frame bad()ret (int[],int){return ([1,2],3);}",
  "frame bad()ret (u8[],int){return match(true){true=>([1,2],3),false=>{return ([4,5],6);},};}",
  "frame bad()ret (int[],int){return ((([1,2],3)));}",
  "frame bad()ret (int[],int){return true?([1,2],3):([4,5],6);}",
  "frame bad()ret ((int[],int),int){return (([1,2],3),4);}",
  "struct Box{v:int[],}frame bad()ret Box{return Box{v:[1,2]};}",
  "struct Box<T>{v:T,}frame bad()ret Box<int[]>{return Box<int[]>{v:[1,2]};}",
  "struct Box{v:int[],}frame bad()ret int[]{return (Box{v:[1,2]}).v;}",
  "struct Box{v:u8[],}frame bad()ret Box{return Box{v:match(true){true=>[1,2],false=>[3,4],}};}",
  "enum Box{Value(int[]),}frame bad()ret Box{return Box.Value([1,2]);}",
  "enum Box{Value{v:int[]},}frame bad()ret Box{return Box.Value{v:[1,2]};}",
  "enum Box<T>{Value(T),}frame bad()ret Box<int[]>{return Box<int[]>.Value([1,2]);}",
  "frame bad()ret int[2][]{return [[1,2],[3,4]];}",
  "frame bad()ret int[]{return [1,2];}",
  "frame bad()ret *int{return [1,2];}",
  "frame bad()ret int[]{local a:int[2]=[1,2];return a;}",
  "frame bad(a:int[2])ret int[]{return a;}",
  "frame bad()ret int[]{return (([1,2]));}",
  "frame bad()ret int[]{return true?[1,2]:[3,4];}",
  "frame bad()ret u8[]{return [1,2];}",
  "type View=int[];frame bad()ret View{return [1,2];}",
  "frame bad()ret int[]{return cast<int[]>([1,2]);}",
  "frame bad()ret i32[]{return cast<i32[]>([1,2]);}",
  "struct Box{v:int[],}frame bad()ret int[]{return (Box{v:cast<i32[]>([1,2])}).v;}",
  "frame bad()ret int[]{return [cast<i32[]>([1,2])][0];}",
  "struct Box{v:int[],frame get(this:Box)ret int[]{return this.v;}}frame bad()ret int[]{return (Box{v:cast<i32[]>([1,2])}).get();}",
  "frame bad()ret *int{return cast<*i32>([1,2])+1;}",
  "frame bad(p:*int)ret *int{return p=cast<*int>([1,2]);}",
  "frame bad()ret int[]{return match(true){true=>{type View=int[];return cast<View>([1,2]);},false=>cast<int[]>([3,4]),};}",
  "frame borrow(v:int[])ret int[]{return v;}frame bad()ret int[]{return borrow(cast<int[]>([1,2]));}",
  "frame borrow(v:*int)ret *int{return v;}frame bad()ret *int{return borrow(cast<*int>([1,2]));}",
  "frame bad()ret int[]{return match(true){true=>cast<int[]>([1,2]),false=>cast<int[]>([3,4]),};}",
  "frame bad()ret int[]{return match(true){true=>{if(true){return cast<int[]>([1,2]);}return cast<int[]>([3,4]);},false=>cast<int[]>([5,6]),};}",
  "struct Box<T>{value:T,}frame wrap<T>(v:T)ret Box<T>{return Box<T>{value:v};}frame bad()ret Box<int[]>{return wrap<int[]>(cast<int[]>([1,2]));}",
  "enum Box{Value(int[]),}frame bad()ret Box{return Box.Value(cast<i32[]>([1,2]));}",
  "enum Box{Value{values:int[]},}frame bad()ret Box{return Box.Value{values:cast<i32[]>([1,2])};}",
  "frame bad()ret int[2][]{return [cast<i32[]>([1,2]),cast<i32[]>([3,4])];}",
  "frame bad()ret *int{return cast<*int>([1,2]);}",
  "frame bad(a:int[2])ret int[]{return cast<int[]>(a);}",
  "frame bad()ret int[]{return ((cast<int[]>([1,2])));}",
  "frame bad(v:int[])ret int[]{return true?v:cast<int[]>([1,2]);}",
  "frame bad()ret (int[],int){return (cast<int[]>([1,2]),3);}",
  "struct Box{values:int[],}frame bad()ret Box{return Box{values:cast<int[]>([1,2])};}",
]) {
  test(`rejects returned array views of frame-local temporary storage: ${source}`, () => {
    const checker = new TypeChecker({ collectAllErrors: true });
    checker.checkProgram(
      new Parser(
        source,
        "array-return.bpl",
        lexWithGrammar(source, "array-return.bpl"),
      ).parse(),
    );
    expect(
      checker
        .getErrors()
        .some((error) => error.code === "BPL_RETURN_ARRAY_VIEW_ESCAPES"),
    ).toBe(true);
  });
}

test("fixed-array values and caller-owned views can still return at O0/O3", () => {
  expectCorrectnessSuite([
    {
      name: "return-safe-array-values",
      validateLlvm: true,
      source: `import printf from "std/c.bpl";
      frame values()ret int[2]{return [11,12];}
      frame borrow(v:int[])ret int[]{return v;}
      frame pointer(v:*int)ret *int{return v;}
      frame main()ret int{
        local a:int[2]=values();
        local view:int[]=borrow(a);
        printf("%d %d\\n",view[0],*pointer(&a[1]));return 0;
      }`,
      expectedStdout: "11 12\n",
    },
  ]);
}, 60000);

test("CLI JSON reports the array-view lifetime diagnostic", () => {
  const root = mkdtempSync(join(tmpdir(), "bpl-return-array-json-"));
  try {
    const file = join(root, "main.bpl");
    writeFileSync(
      file,
      "frame bad()ret int[]{return [1,2];}frame main(){bad();}",
    );
    const result = spawnSync(
      "bun",
      [resolve(__dirname, "../index.ts"), "check", file, "--json"],
      { encoding: "utf8", timeout: 20000 },
    );
    expect(result.status).toBe(1);
    const report = JSON.parse(result.stdout);
    expect(report.success).toBe(false);
    expect(report.errorCount).toBe(1);
    expect(report.files[0].diagnostics[0].code).toBe(
      "BPL_RETURN_ARRAY_VIEW_ESCAPES",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("literal field projection discards unrelated borrowed temporaries", () => {
  const source =
    "struct Box{a:int[],b:int[],}frame safe(v:int[])ret int[]{return (Box{a:cast<int[]>([1,2]),b:v}).b;}";
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(
    new Parser(
      source,
      "projection.bpl",
      lexWithGrammar(source, "projection.bpl"),
    ).parse(),
  );
  expect(checker.getErrors()).toEqual([]);
});

test("returned aggregates preserve caller-owned views and discard unrelated fields at O0/O3", () => {
  expectCorrectnessSuite([
    {
      name: "return-safe-view-aggregates",
      validateLlvm: true,
      source: `struct Box<T>{v:T,}
struct Fields{temporary:int[],kept:int[],}
enum Wrapped<T>{Value(T),}
frame tuple(v:int[])ret (int[],int){return match(true){true=>(v,3),false=>{return (v,4);},};}
frame boxed(v:int[])ret Box<int[]>{return Box<int[]>{v:v};}
frame wrapped(v:int[])ret Wrapped<int[]>{return Wrapped<int[]>.Value(v);}
frame selected(v:int[])ret int[]{local fields:Fields=Fields{temporary:[1,2],kept:v};return fields.kept;}
frame main()ret int{
 local data:int[2]=[11,12];local view:int[]=data;
 local a:(int[],int)=tuple(view);local b:Box<int[]>=boxed(view);
 if(a.0[1]!=12||b.v[0]!=11||selected(view)[1]!=12){return 1;}
 return match(wrapped(view)){Wrapped.Value(values)=>values[1]-12,};
}`,
      expectedStdout: "",
    },
  ]);
}, 60000);

test("returned calls preserve existing views, fixed values and scalar consumers at O0/O3", () => {
  expectCorrectnessSuite([
    {
      name: "return-safe-call-conversions",
      validateLlvm: true,
      source: `frame borrow(v:int[])ret int[]{return v;}
frame safe(v:int[])ret int[]{return borrow(v);}
frame copy(v:int[2])ret int[2]{return v;}
frame values()ret int[2]{return copy([11,12]);}
frame first(v:int[])ret int{return v[0];}
frame consume()ret int{return first([13,14]);}
frame main()ret int{local a:int[2]=values();local v:int[]=safe(a);v[1]=15;if(a[1]!=15||consume()!=13){return 1;}return 0;}`,
      expectedStdout: "",
    },
  ]);
}, 60000);
