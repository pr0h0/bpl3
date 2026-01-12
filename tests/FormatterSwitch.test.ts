import { describe, expect, it } from "bun:test";
import { Formatter } from "../compiler/formatter/Formatter";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import { Parser } from "../compiler/frontend/Parser";

function format(code: string): string {
  const tokens = lexWithGrammar(code, "test.bpl");
  const parser = new Parser(code, "test.bpl", tokens);
  const ast = parser.parse();
  const formatter = new Formatter();
  return formatter.format(ast).trim();
}

describe("Formatter - Switch", () => {
  it("should preserve no braces for single line case", () => {
    const code = `
frame test() {
  switch (x) {
    case 1: break;
  }
}
`.trim();
    const expected = `
frame test() {
    switch (x) {
        case 1: break;
    }
}
`.trim();
    expect(format(code)).toBe(expected);
  });

  it("should preserve no braces for multi-statement case", () => {
    const code = `
frame test() {
  switch (x) {
    case 1:
      a = 1;
      break;
  }
}
`.trim();
    const expected = `
frame test() {
    switch (x) {
        case 1:
            a = 1;
            break;
    }
}
`.trim();
    expect(format(code)).toBe(expected);
  });

  it("should preserve braces if explicit", () => {
    const code = `
frame test() {
  switch (x) {
    case 1: {
      a = 1;
      break;
    }
  }
}
`.trim();
    const expected = `
frame test() {
    switch (x) {
        case 1: {
            a = 1;
            break;
        }
    }
}
`.trim();
    expect(format(code)).toBe(expected);
  });

  it("should handle default case without braces", () => {
    const code = `
frame test() {
  switch (x) {
    default:
      break;
  }
}
`.trim();
    const expected = `
frame test() {
    switch (x) {
        default:
            break;
    }
}
`.trim();
    expect(format(code)).toBe(expected);
  });
});
