import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

function diagnostics(source: string) {
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(
    new Parser(
      source,
      "context-array.bpl",
      lexWithGrammar(source, "context-array.bpl"),
    ).parse(),
  );
  return checker
    .getErrors()
    .map((error) => ({ code: error.code, message: error.message }));
}

for (const [name, source] of Object.entries({
  local: "frame main(){local a:u8[2]=[1,2];a;}",
  assignment: "frame main(){local a:u8[2];a=[1,2];a;}",
  return: "frame bytes()ret u8[2]{return [1,2];}frame main(){bytes();}",
  argument: "frame accept(values:u8[2]){values;}frame main(){accept([1,2]);}",
  generic:
    "frame accept<T>(values:T[2]){values;}frame main(){accept<u8>([1,2]);}",
  pointer:
    "frame accept(values:u8[2]){values;}frame main(){local f:Func<void>(u8[2])=accept;f([1,2]);}",
  lambda: "frame main(){local f:Lambda<void>(u8[2])=|v:u8[2]|{v;};f([1,2]);}",
  nested: "frame main(){local a:u8[2][2]=[[1,2],[3,4]];a;}",
  widening: "frame main(){local v:u8=1;local a:u16[2]=[v,cast<u8>(2)];a;}",
  enum: "enum Data{Bytes(u8[2])}frame main(){local d:Data=Data.Bytes([1,2]);d;}",
  groupedElements: "frame main(){local a:u8[2]=[((1)),((2))];a;}",
  slice: "frame main(){local a:u8[]=[1,2];a;}",
  group: "frame main(){local a:u8[2]=(([1,2]));a;}",
  ternary: "frame main(){local a:u8[2]=true?[1,2]:[3,4];a;}",
  field: "struct Data{a:u8[2]}frame main(){local d:Data=Data{a:[1,2]};d;}",
  alias: "type Bytes=u8[2];frame main(){local a:Bytes=[1,2];a;}",
  method:
    "struct Data{frame accept(this:*Data,a:u8[2]){a;}}frame main(){local d:Data=Data{};d.accept([1,2]);}",
})) {
  test(`contextual integer arrays: ${name}`, () => {
    expect(diagnostics(source)).toEqual([]);
  });
}

for (const source of [
  "frame main(){local a:u8[2]=[1,256];a;}",
  "frame bytes()ret u8[2]{return [1,-1];}frame main(){bytes();}",
  "frame main(){local a:u8[2];a=[1,256];a;}",
]) {
  test(`contextual arrays retain constant range checks: ${source}`, () => {
    expect(
      diagnostics(source).some(
        (error) => error.code === "BPL_INTEGER_LITERAL_OVERFLOW",
      ),
    ).toBe(true);
  });
}

for (const source of [
  "frame main(){local v:int=1;local a:u8[2]=[v,2];a;}",
  "frame main(){local a:u8[3]=[1,2];a;}",
  "frame main(){local a:u8[2][2]=[1,2];a;}",
  "frame accept(a:u8[2][2]){a;}frame main(){accept([1,2]);}",
  "frame main(){local a:u8[2][2]=[[1,2],[3,4,5]];a;}",
  "frame main(){local original:int[2]=[1,2];local a:u8[2]=original;a;}",
  "frame main(){local a:bool[2]=[1,2];a;}",
  "frame accept(v:u8[2]){v;}frame main(){accept([1,256]);}",
]) {
  test(`contextual arrays reject incompatible values: ${source}`, () => {
    expect(diagnostics(source).length).toBeGreaterThan(0);
  });
}

test("contextual array lowering and overload selection work at O0/O3", () => {
  expectCorrectnessSuite([
    {
      name: "contextual-integer-arrays",
      validateLlvm: true,
      source: `
      import printf from "std/c.bpl";
      frame accept(v:u8[2])ret int{return cast<int>(v[0])+cast<int>(v[1]);}
      frame bytes()ret u8[2]{return [3,4];}
      frame choose(v:u8[2])ret int{v;return 2;}
      frame choose(v:int[2])ret int{v;return 1;}
      frame wide(v:u8[2])ret int{v;return 1;}
      frame wide(v:u16[2])ret int{return cast<int>(v[1]);}
      frame sliceChoice(v:u8[])ret int{v;return 2;}
      frame sliceChoice(v:int[])ret int{v;return 1;}
      struct Picker {
        values:u8[2],
        frame choose(this:*Picker,v:u8[2])ret int{v;return 2;}
        frame choose(this:*Picker,v:int[2])ret int{v;return 1;}
      }
      type Pair<T>=T[2];
      frame main()ret int{
        local aliased:Pair<u8>=[1,2];
        local picker:Picker=Picker{values:[1,2]};
        local a:u8[2]=[3,4];
        local grid:u8[2][2]=[[1,2],[3,4]];
        local view:u8[]=[5,6];
        local b:u8[2]=true?[((7)),((8))]:[9,10];
        local f:Func<int>(u8[2])=accept;
        a=[11,12];
        printf("%d %d %d %d %d %d %d %d %d %d %d %d\\n",accept([1,2]),accept(bytes()),cast<int>(grid[1][1]),cast<int>(view[1]),accept(b),f([2,3]),choose([1,2]),wide([1,300]),picker.choose([1,2]),sliceChoice([1,2]),accept(aliased),accept(picker.values));
        return accept(a)-23;
      }`,
      expectedStdout: "3 7 4 6 15 5 1 300 1 1 3 3\n",
    },
  ]);
}, 60000);
