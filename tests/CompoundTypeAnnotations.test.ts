import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

function errors(source: string) {
  const filename = "compound-types.bpl";
  const program = new Parser(
    source,
    filename,
    lexWithGrammar(source, filename),
  ).parse();
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(program);
  return checker.getErrors();
}

for (const annotation of [
  "(int, MissingType)",
  "Func<MissingType>()",
  "Func<int>(MissingType)",
  "Lambda<MissingType>()",
  "Lambda<int>(MissingType)",
  "(int, Func<int>((int, MissingType)))",
]) {
  for (const context of ["local", "catch", "field"]) {
    test(`rejects unknown nested type in ${context} ${annotation}`, () => {
      const body =
        context === "local"
          ? `local _value:${annotation};`
          : `try {} catch(value:${annotation}){value;}`;
      const source =
        context === "field"
          ? `struct Holder{value:${annotation},} frame main(){}`
          : `frame main(){${body}}`;
      const diagnostics = errors(source);
      expect(
        diagnostics.some(
          (error) =>
            error.code === "BPL_TYPE_NOT_FOUND" &&
            error.message.includes("MissingType"),
        ),
      ).toBe(true);
    });
  }
}

test("preserves known nested aliases and generic parameter annotations", () => {
  expect(
    errors(`
    type Number=int;
    struct Box<T>{value:T,}
    struct CallbackBox<Element>{callback:Func<Element>((Element,int)),}
    frame generic<Element>() {
      local _value:(Element, Func<Element>(Box<Element>));
      local _callback:Lambda<Number>((Number, Box<Element>));
    }
    frame main(){
      local _tuple:(Number, Func<Box<int>>(Number));
      try {} catch(value:Lambda<Number>((Number, Box<int>))){value;}
    }
  `),
  ).toEqual([]);
});

test("known compound annotations compile and execute at O0 and O3", () => {
  expectCorrectnessSuite([
    {
      name: "known-compound-annotations",
      source: `
      type Number=int;
      struct Mapper {
        callback:Func<Number>(Number),
        transform:Lambda<Number>(Number),
      }
      frame increment(value:Number) ret Number {return value+1;}
      frame main() ret int {
        local pair:(Number,Func<Number>(Number))=(40,increment);
        local (value:Number,callback:Func<Number>(Number))=pair;
        local mapper:Mapper=Mapper {
          callback:increment,
          transform:|value:Number|ret Number{return value+2;},
        };
        if(callback(value)!=41){return 1;}
        if(mapper.callback(40)!=41 || mapper.transform(40)!=42){return 2;}
        return 0;
      }
    `,
      expectedStdout: "",
    },
  ]);
}, 30000);
