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

describe("Formatter - Extended Tests", () => {
  describe("Generics with Constraints", () => {
    it("should format generic function with constraints", () => {
      const code = `frame process<T: Box<int>>(val: T) {}`;
      const formatted = format(code);
      expect(formatted).toBe(`frame process<T: Box<int>>(val: T) {\n}`);
    });

    it("should format generic struct with constraints", () => {
      const code = `struct Container<T: int> { val: T, }`;
      const formatted = format(code);
      expect(formatted).toBe(`struct Container<T: int> {\n    val: T,\n}`);
    });

    it("should format generic type alias with constraints", () => {
      const code = `type MyAlias<T: int> = Box<T>;`;
      const formatted = format(code);
      expect(formatted).toBe(`type MyAlias<T: int> = Box<T>;`);
    });

    it("should format multiple generic parameters with constraints", () => {
      const code = `frame process<T: int, U: Box<T>>(a: T, b: U) {}`;
      const formatted = format(code);
      expect(formatted).toBe(
        `frame process<T: int, U: Box<T>>(a: T, b: U) {\n}`,
      );
    });

    it("should format mixed generic parameters (some with constraints, some without)", () => {
      const code = `frame process<T, U: int>(a: T, b: U) {}`;
      const formatted = format(code);
      expect(formatted).toBe(`frame process<T, U: int>(a: T, b: U) {\n}`);
    });
  });

  describe("Spec Declarations", () => {
    it("should format simple spec", () => {
      const code = `spec Disposable { frame destroy(this: *Self); }`;
      const formatted = format(code);
      expect(formatted).toBe(
        `spec Disposable {\n    frame destroy(this: *Self);\n}`,
      );
    });

    it("should format spec with inheritance", () => {
      const code = `spec ReadWriter : Reader { frame write(this: *Self, data: string); }`;
      const formatted = format(code);
      expect(formatted).toBe(
        `spec ReadWriter: Reader {\n    frame write(this: *Self, data: string);\n}`,
      );
    });

    it("should format spec with generics", () => {
      const code = `spec Container<T> { frame get() ret T; }`;
      const formatted = format(code);
      expect(formatted).toBe(`spec Container<T> {\n    frame get() ret T;\n}`);
    });

    it("should format variadic spec method parameters", () => {
      const code = `spec Logger { frame write(const fmt: string, values: ...int) ret void; }`;
      const formatted = format(code);
      expect(formatted).toBe(
        `spec Logger {\n    frame write(const fmt: string, values: ...int);\n}`,
      );
    });
  });
});
