import { describe, it } from "bun:test";
import { CompilerError } from "../compiler/common/CompilerError";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

function check(source: string) {
  const tokens = lexWithGrammar(source, "test.bpl");
  const parser = new Parser(source, "test.bpl", tokens);
  const program = parser.parse();
  const typeChecker = new TypeChecker();
  typeChecker.checkProgram(program);
  return typeChecker.getErrors();
}

function expectError(source: string, errorMsgFragment: string) {
  try {
    const errors = check(source);
    if (errors.length === 0) {
      throw new Error(
        `Expected error containing "${errorMsgFragment}", but got no errors.`,
      );
    }
    const combinedError = errors.map((e) => e.message).join("\n");
    if (!combinedError.toLowerCase().includes(errorMsgFragment.toLowerCase())) {
      throw new Error(
        `Expected error containing "${errorMsgFragment}", but got: ${combinedError}`,
      );
    }
  } catch (e: any) {
    if (e instanceof CompilerError) {
      if (!e.message.toLowerCase().includes(errorMsgFragment.toLowerCase())) {
        throw new Error(
          `Expected error containing "${errorMsgFragment}", but got: ${e.message}`,
        );
      }
      return; // Success
    }
    if (e.message.startsWith("Expected error")) {
      throw e;
    }
    if (e.message.toLowerCase().includes(errorMsgFragment.toLowerCase())) {
      return;
    }
    throw new Error(`Unexpected error: ${e.message}`);
  }
}

describe("Bug Fix - Struct Literals", () => {
  it("should reject struct literal with missing fields", () => {
    const source = `
      struct Point { x: bool, y: bool, }
      frame main() {
        local p: Point = Point{x:true,};
      }
    `;
    expectError(source, "Missing field");
  });
});
