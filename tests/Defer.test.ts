import { describe, expect, it } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { Formatter } from "../compiler/formatter/Formatter";
import { runBpl } from "./runtime_utils";

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
});
