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

  throw new Error(`Expected type checking to fail: ${source}`);
}

describe("TypeChecker generic arity diagnostics", () => {
  test("codes generic type argument-count mismatches", () => {
    const source = `
      struct Box<T> {
        value: T,
      }

      frame main() {
        local box: Box<int, bool>;
      }
    `;

    const error = expectCompilerError(source);

    expect(error.message).toContain(
      "Generic type 'Box' expects 1 type arguments, but got 2.",
    );
    expect(error.hint).toBe("Check generic argument count.");
    expect(error.code).toBe("BPL_GENERIC_ARITY_MISMATCH");
  });

  test("codes generic alias argument-count mismatches", () => {
    const source = `
      struct Box<T> {
        value: T,
      }

      type Alias<T> = Box<T>;

      frame main() {
        local box: Alias<int, bool>;
      }
    `;

    const error = expectCompilerError(source);

    expect(error.message).toContain(
      "Generic type 'Alias' expects 1 type arguments, but got 2.",
    );
    expect(error.hint).toBe("Check generic argument count.");
    expect(error.code).toBe("BPL_GENERIC_ARITY_MISMATCH");
  });
  test("rejects explicit arguments on nongeneric values and struct expressions", () => {
    for (const source of [
      "frame main(){local s:int=1;local t:int=s<int>;}",
      "struct Plain{frame make()ret int{return 1;}}frame main(){Plain<int>.make();}",
      "struct Box<T>{frame make()ret int{return 1;}}frame main(){Box<int,bool>.make();}",
      "struct Box<T>{frame make()ret int{return 1;}}frame main(){Box<NoSuchType>.make();}",
      "struct Box{frame value<T>(this:*Box)ret int{return 1;}}frame main(){local b:Box;local f:Lambda<int>()=b.value<int,bool>;}",
    ]) {
      const error = expectCompilerError(source);
      expect(error.location.startLine).toBeGreaterThan(0);
    }
  });

  test("preserves valid explicit struct, function and bound-method instantiation", () => {
    check(`
      struct Box<T>{frame make()ret int{return 1;}frame value<U>(this:*Box<T>)ret int{return 2;}}
      frame identity<T>(value:T)ret T{return value;}
      frame main(){
        Box<int>.make();
        local b:Box<int>;
        local f:Lambda<int>()=b.value<bool>;
        local g:Func<int>(int)=identity<int>;
        g(f());
      }
    `);
  });
});
