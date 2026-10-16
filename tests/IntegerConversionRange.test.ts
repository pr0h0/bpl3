import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

const cases: Record<string, string> = {
  callable:
    "struct Item{frame __call__(this:*Item,x:u8)ret int{return cast<int>(x);}}frame main()ret int{local item:Item;return item(300);}",
  genericCallable:
    "struct Item<T>{frame __call__(this:*Item<T>,x:T)ret int{return cast<int>(x);}}frame main()ret int{local item:Item<u8>;return item(300);}",
  destructuring:
    "frame main()ret int{local (x:u8,y:int)=(300,1);return cast<int>(x)+y;}",
  nestedDestructuring:
    "frame main()ret int{local ((x:u8,y:int),z:int)=((300,1),2);return cast<int>(x)+y+z;}",
  conditionalDestructuring:
    "frame main()ret int{local (x:u8,y:int)=true?(1,2):(300,3);return cast<int>(x)+y;}",
  method:
    "struct Item{frame take(this:*Item,x:u8)ret int{return cast<int>(x);}}frame main()ret int{local item:Item;return item.take(300);}",
  externVariadic:
    "extern native_take(x:u8,...)ret int;frame main()ret int{return native_take(300,1);}",
  variadic:
    "frame take(...args:u8,count:int)ret int{return count+cast<int>(args[0]);}frame main()ret int{return take(1,300);}",
  variadicFixed:
    "frame take(first:u8,...args:int,count:int)ret int{return cast<int>(first)+count+args[0];}frame main()ret int{return take(300,1);}",
  enumTuple:
    "enum Item{Value(u8)}frame main(){local item:Item=Item.Value(300);match(item){Item.Value(value)=>{local used:u8=value;used;},}}",
  enumField:
    "enum Item{Value{value:u8}}frame main(){local item:Item=Item.Value{value:300};item;}",
  memberAssignment:
    "struct Item{value:u8}frame main()ret int{local item:Item=Item{value:0};item.value=300;return cast<int>(item.value);}",
  indexAssignment:
    "frame main()ret int{local items:u8[1]=[cast<u8>(0)];items[0]=300;return cast<int>(items[0]);}",

  return: "frame main()ret u8{return 300;}",
  assignment: "frame main()ret int{local x:u8=0;x=(3_00);return cast<int>(x);}",
  argument:
    "frame take(x:u8)ret int{return cast<int>(x);}frame main()ret int{return take(300);}",
  callback:
    "frame take(x:u8)ret int{return cast<int>(x);}frame main()ret int{local call:Func<int>(u8)=take;return call(300);}",
  generic:
    "frame take<T>(x:T)ret T{return x;}frame main()ret int{return cast<int>(take<u8>(300));}",
  field:
    "struct Item{value:u8}frame main()ret int{local item:Item=Item{value:300};return cast<int>(item.value);}",
  alias: "type Byte=u8;frame main()ret Byte{return -1;}",
};
for (const [name, source] of Object.entries(cases)) {
  test(`out-of-range implicit integer conversion: ${name}`, () => {
    const checker = new TypeChecker({ collectAllErrors: true });
    checker.checkProgram(
      new Parser(
        source,
        "range.bpl",
        lexWithGrammar(source, "range.bpl"),
      ).parse(),
    );
    const diagnostics = checker.getErrors();
    expect(
      diagnostics.map((error) => ({
        code: error.code,
        message: error.message,
      })),
    ).toContainEqual(
      expect.objectContaining({ code: "BPL_INTEGER_LITERAL_OVERFLOW" }),
    );
  });
}

test("valid integer boundaries and explicit truncation work in conversion contexts", () => {
  expectCorrectnessSuite([
    {
      name: "integer-conversion-boundaries",
      validateLlvm: true,
      source: `struct Item{value:u8}
struct Callable{frame __call__(this:*Callable,x:u8)ret int{return cast<int>(x);}}
frame take(x:u8)ret u8{return x;}
frame generic<T>(x:T)ret T{return x;}
frame minimum()ret i8{return -(1_28);}
frame sum(...args:u8,count:int)ret int{local total:int=0;loop(local i:int=0;i<count;i=i+1){total=total+cast<int>(args[i]);}return total;}
frame main()ret int{
 local callable:Callable;
 local ((part:u8,other:int),last:int)=((255,2),3);
 local (truncated:u8,ignored:int)=(cast<u8>(300),4);
 if(callable(255)!=255||callable(cast<u8>(300))!=44||part!=cast<u8>(255)||other!=2||last!=3||truncated!=cast<u8>(44)||ignored!=4){return 4;}
 local x:u8=0;x=(2_55);
 local item:Item=Item{value:255};
 local call:Func<u8>(u8)=take;
 if(x!=cast<u8>(255)||item.value!=cast<u8>(255)||take(255)!=cast<u8>(255)||call(255)!=cast<u8>(255)||generic<u8>(255)!=cast<u8>(255)||minimum()!=cast<i8>(-128)){return 1;}
 if(sum(1,255)!=256||sum(cast<u8>(300))!=44){return 3;}
 x=cast<u8>(300);item=Item{value:cast<u8>(300)};
 if(x!=cast<u8>(44)||item.value!=cast<u8>(44)||take(cast<u8>(300))!=cast<u8>(44)){return 2;}return 0;
}`,
      expectedStdout: "",
    },
  ]);
}, 60000);
