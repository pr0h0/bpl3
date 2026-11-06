import { describe, expect, it } from "bun:test";

import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

function check(source: string) {
  const tokens = lexWithGrammar(source, "test.bpl");
  const parser = new Parser(source, "test.bpl", tokens);
  const program = parser.parse();
  const typeChecker = new TypeChecker();
  typeChecker.checkProgram(program);
  const typeErrors = typeChecker.getErrors();
  if (typeErrors.length > 0) {
    throw typeErrors[0];
  }
  return program;
}

describe("Match Explicit Return", () => {
  it("should accept explicit return in match arm block", () => {
    const source = `
      enum Status { Ok, Error(int) }
      
      frame main() {
        local s: Status = Status.Ok;
        local _res: string = match(s) {
          Status.Ok => "OK",
          Status.Error(code) => {
            if (code == 404) {
              return "Not Found";
            }
            return "Error";
          }
        };
      }
    `;
    expect(() => check(source)).not.toThrow();
  });

  it("should reject mismatched return types in match arm", () => {
    const source = `
      enum Status { Ok, Error(int) }
      
      frame main() {
        local s: Status = Status.Ok;
        local res: string = match(s) {
          Status.Ok => "OK",
          Status.Error(code) => {
            if (code == 404) {
              return 404; // Error: expected string (inferred from other arms)
            }
            return "Error";
          }
        };
      }
    `;
    expect(() => check(source)).toThrow();
  });

  it("should reject return type mismatch with other arms", () => {
    const source = `
      enum Status { Ok, Error(int) }
      
      frame main() {
        local s: Status = Status.Ok;
        local res: int = match(s) {
          Status.Ok => 200,
          Status.Error(code) => {
            return "Error"; // Error: expected int
          }
        };
      }
    `;
    expect(() => check(source)).toThrow();
  });

  it("should handle nested matches with explicit returns", () => {
    const source = `
      enum Inner { Val(int), Empty }
      enum Outer { Wrap(Inner), None }
      
      frame main() {
        local opt: Outer = Outer.Wrap(Inner.Val(10));
        
        local _res: int = match(opt) {
          Outer.None => 0,
          Outer.Wrap(inner) => {
            return match(inner) {
               Inner.Val(v) => { return v + 1; },
               Inner.Empty => 0
            };
          }
        };
      }
    `;
    expect(() => check(source)).not.toThrow();
  });

  it("should reject mixed implicit and explicit returns", () => {
    const source = `
      enum Status { A, B }

      frame main() {
        local s: Status = Status.A;

        local res: int = match(s) {
          Status.A => {
            if (true) {
              return 10;
            }
            # Fallthrough to implicit return
            20
          },
          Status.B => 30
        };
      }
    `;
    expect(() => check(source)).toThrow();
  });
});
