import { describe, expect, it } from "bun:test";
import { Parser } from "../compiler/frontend/Parser";
import { Formatter } from "../compiler/formatter/Formatter";

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
});
