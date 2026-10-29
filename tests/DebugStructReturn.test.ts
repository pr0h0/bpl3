import { describe, it } from "bun:test";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

function check(source: string) {
  try {
    const tokens = lexWithGrammar(source, "test.bpl");
    const parser = new Parser(source, "test.bpl", tokens);
    const program = parser.parse();
    const typeChecker = new TypeChecker();
    typeChecker.checkProgram(program);
    const typeErrors = typeChecker.getErrors();
    if (typeErrors.length > 0) {
      console.log("Type Error:", typeErrors[0]);
      throw typeErrors[0];
    }
    return program;
  } catch (e: any) {
    console.log("Caught Error:", e);
    if (e.location) {
      console.log(
        `Location: Line ${e.location.start.line}, Column ${e.location.start.column}`,
      );
    }
    throw e;
  }
}

describe("Debug Struct Return", () => {
  it("should parse struct return in match", () => {
    const source = `
      struct Point { x: int, y: int, }
      enum Shape { Circle }
      
      frame main() {
        local s: Shape = Shape.Circle;
        match(s) {
          Shape.Circle => {
            10;
          }
        };
      }
    `;
    check(source);
  });
});
