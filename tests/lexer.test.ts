import { describe, expect, it } from "bun:test";

import Lexer from "../lexer/lexer";
import TokenType from "../lexer/tokenType";

describe("Lexer", () => {
  it("should tokenize basic arithmetic operators", () => {
    const input = "+ - * / %";
    const lexer = new Lexer(input);
    const tokens = lexer.tokenize();
    expect(tokens.map((t) => t.type)).toEqual([
      TokenType.PLUS,
      TokenType.MINUS,
      TokenType.STAR,
      TokenType.SLASH,
      TokenType.PERCENT,
      TokenType.EOF,
    ]);
  });

  it("should tokenize assignment operators", () => {
    const input = "= += -= *= /= %= &= |= ^=";
    const lexer = new Lexer(input);
    const tokens = lexer.tokenize();
    expect(tokens.map((t) => t.type)).toEqual([
      TokenType.ASSIGN,
      TokenType.PLUS_ASSIGN,
      TokenType.MINUS_ASSIGN,
      TokenType.STAR_ASSIGN,
      TokenType.SLASH_ASSIGN,
      TokenType.PERCENT_ASSIGN,
      TokenType.AMPERSAND_ASSIGN,
      TokenType.PIPE_ASSIGN,
      TokenType.CARET_ASSIGN,
      TokenType.EOF,
    ]);
  });

  it("should tokenize comparison operators", () => {
    const input = "== != < > <= >=";
    const lexer = new Lexer(input);
    const tokens = lexer.tokenize();
    expect(tokens.map((t) => t.type)).toEqual([
      TokenType.EQUAL,
      TokenType.NOT_EQUAL,
      TokenType.LESS_THAN,
      TokenType.GREATER_THAN,
      TokenType.LESS_EQUAL,
      TokenType.GREATER_EQUAL,
      TokenType.EOF,
    ]);
  });

  it("should tokenize logical and bitwise operators", () => {
    const input = "&& || & | ^ ~ << >>";
    const lexer = new Lexer(input);
    const tokens = lexer.tokenize();
    expect(tokens.map((t) => t.type)).toEqual([
      TokenType.AND,
      TokenType.OR,
      TokenType.AMPERSAND,
      TokenType.PIPE,
      TokenType.CARET,
      TokenType.TILDE,
      TokenType.BITSHIFT_LEFT,
      TokenType.BITSHIFT_RIGHT,
      TokenType.EOF,
    ]);
  });

  it("should tokenize punctuation", () => {
    const input = "( ) { } [ ] , ; . : ?";
    const lexer = new Lexer(input);
    const tokens = lexer.tokenize();
    expect(tokens.map((t) => t.type)).toEqual([
      TokenType.OPEN_PAREN,
      TokenType.CLOSE_PAREN,
      TokenType.OPEN_BRACE,
      TokenType.CLOSE_BRACE,
      TokenType.OPEN_BRACKET,
      TokenType.CLOSE_BRACKET,
      TokenType.COMMA,
      TokenType.SEMICOLON,
      TokenType.DOT,
      TokenType.COLON,
      TokenType.QUESTION,
      TokenType.EOF,
    ]);
  });

  it("should tokenize identifiers", () => {
    const input = "abc var_name _private";
    const lexer = new Lexer(input);
    const tokens = lexer.tokenize();
    expect(tokens.map((t) => t.type)).toEqual([
      TokenType.IDENTIFIER,
      TokenType.IDENTIFIER,
      TokenType.IDENTIFIER,
      TokenType.EOF,
    ]);
    expect(tokens[0]!.value).toBe("abc");
    expect(tokens[1]!.value).toBe("var_name");
    expect(tokens[2]!.value).toBe("_private");
  });

  it("should tokenize number literals", () => {
    const input = "123 0xFF 0b101";
    const lexer = new Lexer(input);
    const tokens = lexer.tokenize();
    expect(tokens.map((t) => t.type)).toEqual([
      TokenType.NUMBER_LITERAL,
      TokenType.NUMBER_LITERAL,
      TokenType.NUMBER_LITERAL,
      TokenType.EOF,
    ]);
    expect(tokens[0]!.value).toBe("123");
    expect(tokens[1]!.value).toBe("0xff"); // 255
    expect(tokens[2]!.value).toBe("0x5"); // 5
  });

  it("should tokenize string literals", () => {
    const input = '"hello" "world\\n"';
    const lexer = new Lexer(input);
    const tokens = lexer.tokenize();
    expect(tokens.map((t) => t.type)).toEqual([
      TokenType.STRING_LITERAL,
      TokenType.STRING_LITERAL,
      TokenType.EOF,
    ]);
    expect(tokens[0]!.value).toBe("hello");
    expect(tokens[1]!.value).toBe("world\\n");
  });

  it("should ignore comments", () => {
    const input = "123 # this is a comment\n456";
    const lexer = new Lexer(input);
    const tokens = lexer.tokenize();
    expect(tokens.map((t) => t.type)).toEqual([
      TokenType.NUMBER_LITERAL,
      TokenType.NUMBER_LITERAL,
      TokenType.EOF,
    ]);
  });

  it("should handle complex expressions", () => {
    const input = "var x = 10 + 20;";
    const lexer = new Lexer(input);
    const tokens = lexer.tokenize();
    expect(tokens.map((t) => t.type)).toEqual([
      TokenType.IDENTIFIER, // var
      TokenType.IDENTIFIER, // x
      TokenType.ASSIGN,
      TokenType.NUMBER_LITERAL,
      TokenType.PLUS,
      TokenType.NUMBER_LITERAL,
      TokenType.SEMICOLON,
      TokenType.EOF,
    ]);
  });
});
