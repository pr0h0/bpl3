import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

const cases: Record<string, string> = {
  inline:
    "frame value(flag:bool)ret u8{return match(flag){true=>300,false=>0,};}frame main(){value(true);}",
  block:
    "frame value(flag:bool)ret u8{return match(flag){true=>{return 300;},false=>{return 0;},};}frame main(){value(true);}",
  nestedControl:
    "frame value(flag:bool)ret u8{return match(flag){true=>{if(flag){return 300;}else{return 0;}},false=>0,};}frame main(){value(true);}",
  caughtYield:
    "frame value(flag:bool)ret u8{return match(flag){true=>{try{throw 1;}catch{ return 300;}},false=>0,};}frame main(){value(true);}",
  nestedMatch:
    "frame value(flag:bool)ret u8{return match(flag){true=>{return match(flag){true=>300,false=>0,};},false=>0,};}frame main(){value(true);}",
  assignment:
    "frame main(){local value:u8=0;value=match(true){true=>300,false=>0,};value;}",
  argument:
    "frame take(value:u8){value;}frame main(){take(match(true){true=>300,false=>0,});}",
  tupleYield:
    "frame main(){local value:(int,u8)=match(true){true=>{return (1,300);},false=>(1,0),};value;}",
};
for (const [name, source] of Object.entries(cases)) {
  test(`match results preserve destination integer ranges: ${name}`, () => {
    const checker = new TypeChecker({ collectAllErrors: true });
    checker.checkProgram(
      new Parser(
        source,
        "match-range.bpl",
        lexWithGrammar(source, "match-range.bpl"),
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

test("match result checks preserve explicit casts and independent lambda returns", () => {
  expectCorrectnessSuite([
    {
      name: "match-range-valid",
      validateLlvm: true,
      source: `frame value(flag:bool)ret u8{
 return match(flag){true=>{local callback:Lambda<int>()=||ret int{return 300;};if(callback()!=300){throw 1;}return 255;},false=>{return 0;},};
}
frame main()ret int{
 if(value(true)!=cast<u8>(255)||value(false)!=cast<u8>(0)){return 1;}
 local explicit:u8=cast<u8>(match(true){true=>{return 300;},false=>0,});
 if(explicit!=cast<u8>(44)){return 2;}
 local pair:(int,u8)=match(true){true=>{return(1,255);},false=>(1,0),};pair;
 local values:u8[2]=[cast<u8>(1),match(true){true=>255,false=>0,}];
 if(values[1]!=cast<u8>(255)){return 3;}return 0;
}`,
      expectedStdout: "",
    },
  ]);
}, 60000);
