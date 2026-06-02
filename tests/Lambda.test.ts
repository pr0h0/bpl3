import { describe, expect, it } from "bun:test";

import { CodeGenerator } from "../compiler/backend/CodeGenerator";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { TypeChecker } from "../compiler/middleend/TypeChecker";

function compile(source: string): string {
  const tokens = lexWithGrammar(source, "test.bpl");
  const parser = new Parser(source, "test.bpl", tokens);
  const program = parser.parse();
  const typeChecker = new TypeChecker();
  typeChecker.checkProgram(program);
  const generator = new CodeGenerator();
  return generator.generate(program);
}

describe("Lambda Code Generation", () => {
  it("should generate code for a simple non-capturing lambda", () => {
    const source = `
      frame main() ret int {
        local f: Lambda<int>(int) = |x: int| ret int { return x * 2; };
        return f(10);
      }
    `;
    const ir = compile(source);

    // Should generate the lambda function body (might not be internal)
    expect(ir).toContain("define i32 @lambda_");
    // The lambda should take the closure context as first arg
    // Pattern: lambda_L{line}_C{col}_{retType}
    expect(ir).toMatch(
      /define i32 @lambda_L\d+_C\d+_i32\(i8\* %__closure_ctx, i32 %x\)/,
    );
    // Should call the lambda
    expect(ir).toContain("call i32");
  });

  it("should generate code for a capturing lambda", () => {
    const source = `
      frame main() ret int {
        local y: int = 100;
        local f: Lambda<int>(int) = |x: int| ret int { return x + y; };
        return f(5);
      }
    `;
    const ir = compile(source);

    // Should generate a context struct for capture
    expect(ir).toMatch(/%struct.lambda_.*_ctx = type { i32 }/);

    // Inside the lambda, it should load from the closure context
    expect(ir).toContain("getelementptr"); // accessing closure field
    expect(ir).toContain("load i32"); // loading captured value
  });

  it("should handle nested lambdas", () => {
    const source = `
      frame main() ret int {
        local x: int = 10;
        local f: Lambda<Lambda<int>(int)>(int) = |y: int| ret Lambda<int>(int) {
            return |z: int| ret int {
                return x + y + z;
            };
        };
        local g: Lambda<int>(int) = f(20);
        return g(30);
      }
    `;
    const ir = compile(source);

    // Should generate two lambda functions
    const matches = ir.match(/define .* @lambda_/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  it("should capture variables referenced inside match expressions", () => {
    const source = `
      enum Flag {
        On,
        Off,
      }

      frame main() ret int {
        local offset: int = 5;
        local f: Lambda<int>(Flag) = |flag: Flag| ret int {
          return match (flag) {
            Flag.On => offset,
            Flag.Off => 0,
          };
        };
        return f(Flag.On);
      }
    `;
    const ir = compile(source);

    expect(ir).toMatch(/%struct.lambda_.*_ctx = type { i32 }/);
  });

  it("should capture variables referenced inside switch cases", () => {
    const source = `
      frame main() ret int {
        local offset: int = 5;
        local f: Lambda<int>(int) = |value: int| ret int {
          switch (value) {
            case 1: {
              return offset;
            }
            default: {
              return 0;
            }
          }
        };
        return f(1);
      }
    `;
    const ir = compile(source);

    expect(ir).toMatch(/%struct.lambda_.*_ctx = type { i32 }/);
  });

  it("should pass lambda as argument", () => {
    const source = `
      frame apply(f: Lambda<int>(int), v: int) ret int {
        return f(v);
      }
      
      frame main() ret int {
        return apply(|x: int| ret int { return x * x; }, 5);
      }
    `;
    const ir = compile(source);

    expect(ir).toContain("define i32 @apply");
    expect(ir).toContain("call i32 @apply");
  });

  it("should return lambda from function", () => {
    const source = `
      frame getAdder(x: int) ret Lambda<int>(int) {
        return |y: int| ret int { return x + y; };
      }
      
      frame main() ret int {
        local add5: Lambda<int>(int) = getAdder(5);
        return add5(10);
      }
    `;
    const ir = compile(source);

    // Return type should be a closure struct (function ptr + context ptr)
    // { i32 (i8*, i32)*, i8* }
    expect(ir).toMatch(/define { i32 \(i8\*, i32\)\*, i8\* } @getAdder/);

    // Should allocate closure on heap (malloc) since it escapes
    expect(ir).toContain("call i8* @malloc");
  });
});
