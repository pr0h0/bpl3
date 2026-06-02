import { describe, expect, it } from "bun:test";
import { CodeGenerator } from "../compiler/backend/CodeGenerator";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";
import { Formatter } from "../compiler/formatter/Formatter";
import { TypeChecker } from "../compiler/middleend/TypeChecker";
import { runBpl } from "./runtime_utils";

function compile(source: string): string {
  const tokens = lexWithGrammar(source, "test.bpl");
  const parser = new Parser(source, "test.bpl", tokens);
  const program = parser.parse();
  const typeChecker = new TypeChecker();
  typeChecker.checkProgram(program);
  const generator = new CodeGenerator();
  return generator.generate(program);
}

describe("Defer Statement", () => {
  it("should parse defer statement", () => {
    const code = `
      frame main() {
        defer print("cleanup");
      }
    `;
    const parser = new Parser(code, "test.bpl");
    const ast = parser.parse();
    const func = ast.statements[0] as any;
    expect(func.body.statements[0].kind).toBe("Defer");
  });

  it("should format defer statement", () => {
    const code = `frame main() {
    defer print("cleanup");
}
`;
    const parser = new Parser(code, "test.bpl");
    const ast = parser.parse();
    const formatter = new Formatter();
    const formatted = formatter.format(ast);
    expect(formatted).toBe(code);
  });

  it("should format defer block", () => {
    const code = `frame main() {
    defer {
        print("cleanup");
    }
}
`;
    const parser = new Parser(code, "test.bpl");
    const ast = parser.parse();
    const formatter = new Formatter();
    const formatted = formatter.format(ast);
    expect(formatted).toBe(code);
  });

  it("should capture locals referenced inside deferred switch cases", () => {
    const source = `
      extern printf(fmt: string, ...);

      frame main() ret int {
        local value: int = 7;
        defer {
          switch (1) {
            case 1: {
              printf("defer value: %d\\n", value);
              break;
            }
            default: {
              break;
            }
          }
        }
        return 0;
      }
    `;
    const result = runBpl(source, "defer_switch_capture");
    if (result.exitCode !== 0) {
      console.error("STDERR:", result.stderr);
    }
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("defer value: 7");
  });

  it("should keep deferred match pattern bindings from capturing shadowed outer locals", () => {
    const source = `
      extern printf(fmt: string, ...);

      enum CaptureOption {
        Some(int),
        None,
      }

      frame main() ret int {
        local value: int = 99;
        defer {
          local result: int = match (CaptureOption.Some(7)) {
            CaptureOption.Some(value) => value,
            CaptureOption.None => 0,
          };
          printf("defer pattern value: %d\\n", result);
        }
        return 0;
      }
    `;
    const ir = compile(source);

    expect(ir).not.toMatch(/%struct.lambda_.*_ctx = type/);
  });

  it("should capture locals referenced inside deferred try and catch blocks", () => {
    const source = `
      extern printf(fmt: string, ...);

      frame main() ret int {
        local value: int = 7;
        defer {
          try {
            printf("defer try value: %d\\n", value);
          } catch (err: int) {
            printf("defer catch value: %d\\n", value + err);
          }
        }
        return 0;
      }
    `;
    const result = runBpl(source, "defer_try_catch_capture");
    if (result.exitCode !== 0) {
      console.error("STDERR:", result.stderr);
    }
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("defer try value: 7");
  });

  it("should capture locals referenced inside deferred is and as expressions", () => {
    const source = `
      extern printf(fmt: string, ...);

      frame main() ret int {
        local value: int = 7;
        defer {
          if (value is int) {
            printf("defer is value\\n");
          }
          local widened: long = value as long;
          printf("defer as value: %ld\\n", widened);
        }
        return 0;
      }
    `;
    const result = runBpl(source, "defer_is_as_capture");
    if (result.exitCode !== 0) {
      console.error("STDERR:", result.stderr);
    }
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("defer is value");
    expect(result.stdout).toContain("defer as value: 7");
  });
});
