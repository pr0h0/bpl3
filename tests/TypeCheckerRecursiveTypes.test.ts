import { describe, expect, test } from "bun:test";

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
  const [error] = typeChecker.getErrors();
  if (error) throw error;
}

function expectCompilerError(source: string): CompilerError {
  try {
    check(source);
  } catch (error) {
    expect(error).toBeInstanceOf(CompilerError);
    return error as CompilerError;
  }

  throw new Error("Expected type checking to fail");
}

describe("TypeChecker recursive type cycles", () => {
  test("codes recursive struct field cycles", () => {
    const source = `
      struct Node {
        next: Node,
      }
    `;

    const error = expectCompilerError(source);

    expect(error.message).toContain(
      "Struct 'Node' has infinite size due to recursive field types",
    );
    expect(error.hint).toContain("Recursive cycle detected: Node -> Node");
    expect(error.code).toBe("BPL_TYPE_RECURSION_CYCLE");
  });

  test("codes recursive enum variant cycles", () => {
    const source = `
      enum Tree {
        Branch(Tree),
        Leaf,
      }
    `;

    const error = expectCompilerError(source);

    expect(error.message).toContain(
      "Enum 'Tree' has infinite size due to recursive variant types",
    );
    expect(error.hint).toContain("Recursive cycle detected: Tree -> Tree");
    expect(error.code).toBe("BPL_TYPE_RECURSION_CYCLE");
  });

  test("codes self-inheritance cycles", () => {
    const source = `
      struct Loop: Loop {
        value: int,
      }
    `;

    const error = expectCompilerError(source);

    expect(error.message).toContain("Struct 'Loop' cannot inherit from itself");
    expect(error.code).toBe("BPL_TYPE_RECURSION_CYCLE");
  });

  test("codes circular inheritance cycles", () => {
    const source = `
      struct A: B {
        value: int,
      }

      struct B: A {
        other: int,
      }
    `;

    const error = expectCompilerError(source);

    expect(error.message).toContain("Circular inheritance detected");
    expect(error.hint).toContain("Inheritance cycle: A -> B -> A");
    expect(error.code).toBe("BPL_TYPE_RECURSION_CYCLE");
  });
});
