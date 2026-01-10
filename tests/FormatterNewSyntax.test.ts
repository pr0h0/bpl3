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

describe("Formatter - New Syntax", () => {
  it("should format typeof specific type", () => {
    const code = `local t = typeof<int>();`;
    const expected = `local t = typeof<int>();`;
    expect(format(code)).toBe(expected);
  });

  it("should format typeof expression", () => {
    const code = `local t = typeof(1 + 2);`;
    const expected = `local t = typeof(1 + 2);`;
    expect(format(code)).toBe(expected);
  });

  it("should format offsetof", () => {
    const code = `local o = offsetof(MyStruct, field);`;
    const expected = `local o = offsetof(MyStruct, field);`;
    expect(format(code)).toBe(expected);
  });

  it("should format generic struct literals", () => {
    const code = `local s = Box<int>{ value: 10 };`;
    const expected = `local s = Box<int> { value: 10 };`;
    expect(format(code)).toBe(expected);
  });

  it("should format generic struct literals with multiple args", () => {
    const code = `local m = Map<string, int>{ key: "k", val: 1 };`;
    const expected = `local m = Map<string, int> { key: "k", val: 1 };`;
    expect(format(code)).toBe(expected);
  });
});
