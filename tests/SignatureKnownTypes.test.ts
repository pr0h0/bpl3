import { expect, test } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { expectCorrectnessSuite } from "./helpers/compilerCorrectness";

function errors(source: string) {
  const file = "signature-types.bpl";
  const checker = new TypeChecker({ collectAllErrors: true });
  checker.checkProgram(
    new Parser(source, file, lexWithGrammar(source, file)).parse(),
  );
  return checker.getErrors();
}

for (const source of [
  "frame bad(_value:MissingType){} frame main(){}",
  "frame bad() ret MissingType{throw 1;} frame main(){}",
  "frame bad(_value:Func<MissingType>(int)){} frame main(){}",
  "struct Holder{frame bad(this:*Holder,_value:MissingType){}} frame main(){}",
  "struct Holder{frame bad(this:*Holder) ret MissingType{throw 1;}} frame main(){}",
  "frame main(){|_value:MissingType|{};}",
  "frame main(){||ret MissingType{throw 1;};}",
  "frame bad(_value:T){} frame main(){}",
]) {
  test(`rejects unknown signature types: ${source}`, () => {
    const missingName = source.includes("MissingType") ? "MissingType" : "T";
    expect(
      errors(source).some(
        (error) =>
          error.code === "BPL_TYPE_NOT_FOUND" &&
          error.message === `Undefined type '${missingName}'`,
      ),
    ).toBe(true);
  });
}

test("declared generic and inferred lambda signatures execute at O0 and O3", () => {
  expectCorrectnessSuite([
    {
      name: "declared-signature-types",
      source: `
      struct Box<Element>{
        value:Element,
        frame get(this:*Box<Element>) ret Element {return this.value;}
      }
      frame identity<Element>(value:Element) ret Element {return value;}
      frame main() ret int {
        local box:Box<int>=Box<int>{value:20};
        local mapper:Lambda<int>(int)=|value|ret int{return identity<int>(value)+2;};
        if(box.get()!=20 || mapper(20)!=22){return 1;}
        return 0;
      }
    `,
      expectedStdout: "",
    },
  ]);
}, 30000);
