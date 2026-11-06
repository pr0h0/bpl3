import { describe, expect, it } from "bun:test";

import { DiagnosticSeverity } from "../compiler/common/CompilerError";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

function check(source: string) {
  const tokens = lexWithGrammar(source, "test.bpl");
  const parser = new Parser(source, "test.bpl", tokens);
  const program = parser.parse();
  const typeChecker = new TypeChecker();
  typeChecker.checkProgram(program);
  const typeErrors = typeChecker
    .getErrors()
    .filter((e) => e.toDiagnostic().severity === DiagnosticSeverity.Error);
  if (typeErrors.length > 0) {
    throw typeErrors[0];
  }
  return program;
}

describe("Match Explicit Return Extended", () => {
  it("should handle void match with explicit return", () => {
    const source = `
      enum Status { Ok, Error }
      
      frame main() {
        local s: Status = Status.Ok;
        
        # Match as a statement (void result)
        match(s) {
          Status.Ok => {
            return; # Explicit void return
          },
          Status.Error => {
            # Implicit void return
          }
        };
      }
    `;
    expect(() => check(source)).not.toThrow();
  });

  it("should reject value return in void match", () => {
    const source = `
      enum Status { Ok, Error }
      
      frame main() {
        local s: Status = Status.Ok;
        
        # Match inferred as void because one arm is void (implicit)
        # But wait, type inference tries to unify. 
        # If one arm returns void and another returns int, it's a mismatch.
        
        match(s) {
          Status.Ok => {
            return 1; 
          },
          Status.Error => {
            return;
          }
        };
      }
    `;
    expect(() => check(source)).toThrow();
  });

  it("should handle control flow inside match arm", () => {
    const source = `
      enum Status { Ok, Error }
      
      frame main() {
        local s: Status = Status.Ok;
        
        local _res: int = match(s) {
          Status.Ok => {
            local i: int = 0;
            loop (i < 10) {
              if (i == 5) {
                break; # Breaks the loop
              }
              i = i + 1;
            }
            return i;
          },
          Status.Error => 0
        };
      }
    `;
    expect(() => check(source)).not.toThrow();
  });

  it("should handle unreachable code after return", () => {
    const source = `
      enum Status { Ok }
      
      frame main() {
        local s: Status = Status.Ok;
        
        local _res: int = match(s) {
          Status.Ok => {
            return 1;
            local _x: int = 2; # Unreachable but valid syntax
            return _x;
          }
        };
      }
    `;
    expect(() => check(source)).not.toThrow();
  });

  it("should handle returning structs from match", () => {
    const source = `
      struct Point { x: int, y: int, }
      enum Shape { Circle, Square }
      
      frame main() {
        local s: Shape = Shape.Circle;
        
        local _p: Point = match(s) {
          Shape.Circle => {
            return Point { x: 0, y: 0 };
          },
          Shape.Square => {
             return Point { x: 10, y: 10 };
          }
        };
      }
    `;
    expect(() => check(source)).not.toThrow();
  });
});
