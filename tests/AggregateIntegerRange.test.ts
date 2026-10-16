import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

const cases: Record<string, string> = {
  charArray: "frame main(){local values:char[2]=['a',255];values;}",
  tupleInitializer: "frame main(){local pair:(u8,int)=(300,1);pair;}",
  tupleAssignment:
    "frame main(){local a:u8=0;local b:int=0;(a,b)=(300,1);a;b;}",
  tupleReturn: "frame pair()ret (u8,int){return(300,1);}frame main(){pair();}",
  tupleArgument: "frame take(pair:(u8,int)){pair;}frame main(){take((300,1));}",
  arrayInitializer:
    "frame main(){local values:u8[2]=[cast<u8>(1),300];values;}",
  arrayArgument:
    "frame take(values:u8[2]){values;}frame main(){take([cast<u8>(1),300]);}",
  ternaryReturn:
    "frame value(flag:bool)ret u8{return flag?300:0;}frame main(){value(true);}",
  ternaryAssignment: "frame main(){local value:u8=0;value=true?1:300;value;}",
};
for (const [name, source] of Object.entries(cases)) {
  test(`aggregate and branch constants respect their destination: ${name}`, () => {
    const checker = new TypeChecker({ collectAllErrors: true });
    checker.checkProgram(
      new Parser(
        source,
        "aggregate.bpl",
        lexWithGrammar(source, "aggregate.bpl"),
      ).parse(),
    );
    expect(
      checker
        .getErrors()
        .map((error) => ({ code: error.code, message: error.message })),
    ).toContainEqual(
      expect.objectContaining({ code: "BPL_INTEGER_LITERAL_OVERFLOW" }),
    );
  });
}

test("aggregate boundaries and intentional element truncation retain their runtime behavior", () => {
  expectCorrectnessSuite([
    {
      name: "aggregate-integer-boundaries",
      validateLlvm: true,
      source: `frame pair()ret (u8,int){return (255,1);}
frame take(values:u8[2])ret int{return cast<int>(values[0])+cast<int>(values[1]);}
frame conditional(flag:bool)ret u8{return flag?255:0;}
frame main()ret int{
 local a:u8=0;local b:int=0;(a,b)=(255,1);
 local p:(u8,int)=pair();p;
 local values:u8[2]=[cast<u8>(1),255];
 if(a!=cast<u8>(255)||b!=1||take(values)!=256||take([cast<u8>(1),255])!=256||conditional(true)!=cast<u8>(255)||conditional(false)!=cast<u8>(0)){return 1;}
 (a,b)=(cast<u8>(300),2);values=[cast<u8>(300),cast<u8>(0)];
 if(a!=cast<u8>(44)||b!=2||take(values)!=44){return 2;}return 0;
}`,
      expectedStdout: "",
    },
  ]);
}, 60000);
