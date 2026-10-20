import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

function diagnostics(source: string) {
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(new Parser(source, "array-tuples.bpl").parse());
  return checker
    .getErrors()
    .map((error) => ({ code: error.code, message: error.message }));
}

for (const [label, source] of Object.entries({
  local: "frame main(){local pair:(u8[2],int)=([1,2],3);pair;}",
  assignment: "frame main(){local pair:(u8[2],int);pair=([1,2],3);pair;}",
  returned:
    "frame make()ret (u8[2],int){return ([1,2],3);} frame main(){make();}",
  argument:
    "frame accept(pair:(u8[2],int)){pair;}frame main(){accept(([1,2],3));}",
  grouped: "frame main(){local pair:(u8[2],int)=((([1,2],3)));pair;}",
  ternary:
    "frame main(){local pair:(u8[2],int)=true?([1,2],3):([4,5],6);pair;}",
  nested:
    "frame main(){local pair:((u8[2],int),u16[2])=(([1,2],3),[4,5]);pair;}",
  field:
    "struct Data{pair:(u8[2],int)}frame main(){local d:Data=Data{pair:([1,2],3)};d;}",
  alias:
    "type Bytes=u8[2];type Pair=(Bytes,int);frame main(){local pair:Pair=([1,2],3);pair;}",
  scalarCast: "frame main(){local pair:(u8[2],u8)=([1,2],3);pair;}",
  generic:
    "frame accept<T>(pair:(T[2],int)){pair;}frame main(){accept<u8>(([1,2],3));}",
  slice: "frame main(){local pair:(u8[],int)=([1,2],3);pair;}",
  scalarTernary: "frame main(){local pair:(u8[2],u8)=([1,2],true?3:4);pair;}",
})) {
  test(`contextual array tuples: ${label}`, () =>
    expect(diagnostics(source)).toEqual([]));
}

for (const source of [
  "frame main(){local pair:(u8[2],int)=([1,256],3);pair;}",
  "frame main(){local pair:(u8[2],u8)=([1,2],256);pair;}",
  "frame main(){local pair:(u8[3],int)=([1,2],3);pair;}",
  "frame main(){local pair:(u8[2],int)=([1,2],3,4);pair;}",
  "frame main(){local v:int=1;local pair:(u8[2],int)=([v,2],3);pair;}",
  "frame main(){local a:int[2]=[1,2];local pair:(u8[2],int)=(a,3);pair;}",
  "frame main(){local pair:(bool[2],int)=([1,2],3);pair;}",
]) {
  test(`contextual array tuples reject incompatible values: ${source}`, () => {
    expect(diagnostics(source).length).toBeGreaterThan(0);
  });
}

test("contextual tuple array lowering preserves scalar types and overload priority at O0/O3", () => {
  expectCorrectnessSuite([
    {
      name: "contextual-array-tuples",
      validateLlvm: true,
      source: `
      import printf from "std/c.bpl";
      type Pair<T>=(T[2],u8);
      struct Data { pair:(u8[2],u8), }
      frame sum(pair:(u8[2],u8))ret int{local values:u8[2]=pair.0;return cast<int>(values[0])+cast<int>(values[1])+cast<int>(pair.1);}
      frame make()ret (u8[2],u8){return ([1,2],3);}
      frame choose(pair:(u8[2],int))ret int{pair;return 2;}
      frame choose(pair:(int[2],int))ret int{pair;return 1;}
      frame wide(pair:(u8[2],int))ret int{pair;return 2;}
      frame wide(pair:(u16[2],int))ret int{local values:u16[2]=pair.0;return cast<int>(values[1]);}
      frame nested(value:((u8[2],u8),u16[2]))ret int{
        local inner:(u8[2],u8)=value.0;
        local values:u16[2]=value.1;
        return sum(inner)+cast<int>(values[1]);
      }
      frame main()ret int{
        local slicePair:(u8[],int)=([1,2],3);
        local view:u8[]=slicePair.0;
        local scalarChoice:(u8[2],u8)=([1,2],true?3:4);
        if(view[1]!=2 || sum(scalarChoice)!=6 || nested((([1,2],3),[4,300]))!=306){return 9;}
        local pair:Pair<u8>=(([1,2],3));
        local data:Data=Data{pair:([4,5],6)};
        local selected:(u8[2],u8)=true?([7,8],9):([10,11],12);
        local f:Func<int>((u8[2],u8))=sum;
        local callback:Lambda<int>((u8[2],u8))=|v:(u8[2],u8)|ret int{return sum(v);};
        pair=([10,11],12);
        printf("%d %d %d %d %d %d %d %d\\n",sum(pair),sum(make()),sum(data.pair),sum(selected),f(([1,2],3)),callback(([4,5],6)),choose(([1,2],3)),wide(([1,300],3)));
        return 0;
      }`,
      expectedStdout: "33 6 15 24 6 15 1 300\n",
    },
  ]);
}, 60000);
