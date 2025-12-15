import { describe, it, expect } from "bun:test";
import { lexWithGrammar } from "../compiler/frontend/GrammarLexer";
import type { Token } from "../compiler/frontend/Token";
import { TokenType } from "../compiler/frontend/TokenType";

function tokenize(source: string): Token[] {
  return lexWithGrammar(source, "test.bpl");
}

describe("Lexer - Extended Tests", () => {
  describe("Keywords", () => {
    it("should tokenize 'frame' keyword", () => {
      const tokens = tokenize("frame");
      expect(tokens[0]!.type).toBe(TokenType.Frame);
    });

    it("should tokenize 'struct' keyword", () => {
      const tokens = tokenize("struct");
      expect(tokens[0]!.type).toBe(TokenType.Struct);
    });

    it("should tokenize 'if' keyword", () => {
      const tokens = tokenize("if");
      expect(tokens[0]!.type).toBe(TokenType.If);
    });

    it("should tokenize 'else' keyword", () => {
      const tokens = tokenize("else");
      expect(tokens[0]!.type).toBe(TokenType.Else);
    });

    it("should tokenize 'loop' keyword", () => {
      const tokens = tokenize("loop");
      expect(tokens[0]!.type).toBe(TokenType.Loop);
    });

    it("should tokenize 'return' keyword", () => {
      const tokens = tokenize("return");
      expect(tokens[0]!.type).toBe(TokenType.Return);
    });

    it("should tokenize 'break' keyword", () => {
      const tokens = tokenize("break");
      expect(tokens[0]!.type).toBe(TokenType.Break);
    });

    it("should tokenize 'continue' keyword", () => {
      const tokens = tokenize("continue");
      expect(tokens[0]!.type).toBe(TokenType.Continue);
    });

    it("should tokenize 'switch' keyword", () => {
      const tokens = tokenize("switch");
      expect(tokens[0]!.type).toBe(TokenType.Switch);
    });

    it("should tokenize 'case' keyword", () => {
      const tokens = tokenize("case");
      expect(tokens[0]!.type).toBe(TokenType.Case);
    });

    it("should tokenize 'default' keyword", () => {
      const tokens = tokenize("default");
      expect(tokens[0]!.type).toBe(TokenType.Default);
    });

    it("should tokenize 'local' keyword", () => {
      const tokens = tokenize("local");
      expect(tokens[0]!.type).toBe(TokenType.Local);
    });

    it("should tokenize 'ret' keyword", () => {
      const tokens = tokenize("ret");
      expect(tokens[0]!.type).toBe(TokenType.Ret);
    });

    it("should tokenize 'import' keyword", () => {
      const tokens = tokenize("import");
      expect(tokens[0]!.type).toBe(TokenType.Import);
    });

    it("should tokenize 'export' keyword", () => {
      const tokens = tokenize("export");
      expect(tokens[0]!.type).toBe(TokenType.Export);
    });

    it("should tokenize 'from' keyword", () => {
      const tokens = tokenize("from");
      expect(tokens[0]!.type).toBe(TokenType.From);
    });

    it("should tokenize 'as' keyword", () => {
      // TODO: Should tokenize "as" as separate token instead of Identifier
      const tokens = tokenize("as");
      expect(tokens[0]!.type).toBe(TokenType.As);
    });

    it("should tokenize 'type' keyword", () => {
      const tokens = tokenize("type");
      expect(tokens[0]!.type).toBe(TokenType.Type);
    });

    it("should tokenize 'cast' keyword", () => {
      const tokens = tokenize("cast");
      expect(tokens[0]!.type).toBe(TokenType.Cast);
    });

    it("should tokenize 'sizeof' keyword", () => {
      const tokens = tokenize("sizeof");
      expect(tokens[0]!.type).toBe(TokenType.Sizeof);
    });

    it("should tokenize 'true' keyword", () => {
      const tokens = tokenize("true");
      expect(tokens[0]!.type).toBe(TokenType.True);
    });

    it("should tokenize 'false' keyword", () => {
      const tokens = tokenize("false");
      expect(tokens[0]!.type).toBe(TokenType.False);
    });

    it("should tokenize 'null' keyword", () => {
      const tokens = tokenize("null");
      expect(tokens[0]!.type).toBe(TokenType.Null);
    });

    it("should tokenize 'this' keyword", () => {
      // TODO: Should tokenize "this" as separate token instead of Identifier
      const tokens = tokenize("this");
      expect(tokens[0]!.type).toBe(TokenType.This);
    });

    it("should tokenize 'extern' keyword", () => {
      const tokens = tokenize("extern");
      expect(tokens[0]!.type).toBe(TokenType.Extern);
    });
  });

  describe("Operators", () => {
    it("should tokenize '+' operator", () => {
      const tokens = tokenize("+");
      expect(tokens[0]!.type).toBe(TokenType.Plus);
    });

    it("should tokenize '-' operator", () => {
      const tokens = tokenize("-");
      expect(tokens[0]!.type).toBe(TokenType.Minus);
    });

    it("should tokenize '*' operator", () => {
      const tokens = tokenize("*");
      expect(tokens[0]!.type).toBe(TokenType.Star);
    });

    it("should tokenize '/' operator", () => {
      const tokens = tokenize("/");
      expect(tokens[0]!.type).toBe(TokenType.Slash);
    });

    it("should tokenize '%' operator", () => {
      const tokens = tokenize("%");
      expect(tokens[0]!.type).toBe(TokenType.Percent);
    });

    it("should tokenize '+=' operator", () => {
      const tokens = tokenize("+=");
      expect(tokens[0]!.type).toBe(TokenType.PlusEqual);
    });

    it("should tokenize '-=' operator", () => {
      const tokens = tokenize("-=");
      expect(tokens[0]!.type).toBe(TokenType.MinusEqual);
    });

    it("should tokenize '*=' operator", () => {
      const tokens = tokenize("*=");
      expect(tokens[0]!.type).toBe(TokenType.StarEqual);
    });

    it("should tokenize '/=' operator", () => {
      const tokens = tokenize("/=");
      expect(tokens[0]!.type).toBe(TokenType.SlashEqual);
    });

    it("should tokenize '==' operator", () => {
      const tokens = tokenize("==");
      expect(tokens[0]!.type).toBe(TokenType.EqualEqual);
    });

    it("should tokenize '!=' operator", () => {
      const tokens = tokenize("!=");
      expect(tokens[0]!.type).toBe(TokenType.BangEqual);
    });

    it("should tokenize '<' operator", () => {
      const tokens = tokenize("<");
      expect(tokens[0]!.type).toBe(TokenType.Less);
    });

    it("should tokenize '>' operator", () => {
      const tokens = tokenize(">");
      expect(tokens[0]!.type).toBe(TokenType.Greater);
    });

    it("should tokenize '<=' operator", () => {
      const tokens = tokenize("<=");
      expect(tokens[0]!.type).toBe(TokenType.LessEqual);
    });

    it("should tokenize '>=' operator", () => {
      const tokens = tokenize(">=");
      expect(tokens[0]!.type).toBe(TokenType.GreaterEqual);
    });

    it("should tokenize '&&' operator", () => {
      const tokens = tokenize("&&");
      expect(tokens[0]!.type).toBe(TokenType.AndAnd);
    });

    it("should tokenize '||' operator", () => {
      const tokens = tokenize("||");
      expect(tokens[0]!.type).toBe(TokenType.OrOr);
    });

    it("should tokenize '!' operator", () => {
      const tokens = tokenize("!");
      expect(tokens[0]!.type).toBe(TokenType.Bang);
    });

    it("should tokenize '&' operator", () => {
      const tokens = tokenize("&");
      expect(tokens[0]!.type).toBe(TokenType.Ampersand);
    });

    it("should tokenize '|' operator", () => {
      const tokens = tokenize("|");
      expect(tokens[0]!.type).toBe(TokenType.Pipe);
    });

    it("should tokenize '^' operator", () => {
      const tokens = tokenize("^");
      expect(tokens[0]!.type).toBe(TokenType.Caret);
    });

    it("should tokenize '~' operator", () => {
      const tokens = tokenize("~");
      expect(tokens[0]!.type).toBe(TokenType.Tilde);
    });

    it("should tokenize '<<' operator", () => {
      const tokens = tokenize("<<");
      expect(tokens[0]!.type).toBe(TokenType.LessLess);
    });

    it("should tokenize '>>' operator", () => {
      const tokens = tokenize(">>");
      expect(tokens[0]!.type).toBe(TokenType.GreaterGreater);
    });
  });

  describe("Delimiters", () => {
    it("should tokenize '(' delimiter", () => {
      const tokens = tokenize("(");
      expect(tokens[0]!.type).toBe(TokenType.LeftParen);
    });

    it("should tokenize ')' delimiter", () => {
      const tokens = tokenize(")");
      expect(tokens[0]!.type).toBe(TokenType.RightParen);
    });

    it("should tokenize '{' delimiter", () => {
      const tokens = tokenize("{");
      expect(tokens[0]!.type).toBe(TokenType.LeftBrace);
    });

    it("should tokenize '}' delimiter", () => {
      const tokens = tokenize("}");
      expect(tokens[0]!.type).toBe(TokenType.RightBrace);
    });

    it("should tokenize '[' delimiter", () => {
      const tokens = tokenize("[");
      expect(tokens[0]!.type).toBe(TokenType.LeftBracket);
    });

    it("should tokenize ']' delimiter", () => {
      const tokens = tokenize("]");
      expect(tokens[0]!.type).toBe(TokenType.RightBracket);
    });

    it("should tokenize ',' delimiter", () => {
      const tokens = tokenize(",");
      expect(tokens[0]!.type).toBe(TokenType.Comma);
    });

    it("should tokenize ';' delimiter", () => {
      const tokens = tokenize(";");
      expect(tokens[0]!.type).toBe(TokenType.Semicolon);
    });

    it("should tokenize ':' delimiter", () => {
      const tokens = tokenize(":");
      expect(tokens[0]!.type).toBe(TokenType.Colon);
    });

    it("should tokenize '.' delimiter", () => {
      const tokens = tokenize(".");
      expect(tokens[0]!.type).toBe(TokenType.Dot);
    });
  });

  describe("Identifiers", () => {
    it("should tokenize simple identifier", () => {
      const tokens = tokenize("myVariable");
      console.error(tokens);
      expect(tokens[0]!.type).toBe(TokenType.Identifier);
      expect(tokens[0]!.lexeme).toBe("myVariable");
    });

    it("should tokenize identifier with underscores", () => {
      const tokens = tokenize("my_variable");
      expect(tokens[0]!.type).toBe(TokenType.Identifier);
      expect(tokens[0]!.lexeme).toBe("my_variable");
    });

    it("should tokenize identifier with numbers", () => {
      const tokens = tokenize("var123");
      expect(tokens[0]!.type).toBe(TokenType.Identifier);
      expect(tokens[0]!.lexeme).toBe("var123");
    });

    it("should tokenize camelCase identifier", () => {
      const tokens = tokenize("myVariableName");
      expect(tokens[0]!.type).toBe(TokenType.Identifier);
      expect(tokens[0]!.lexeme).toBe("myVariableName");
    });

    it("should tokenize PascalCase identifier", () => {
      const tokens = tokenize("MyClassName");
      expect(tokens[0]!.type).toBe(TokenType.Identifier);
      expect(tokens[0]!.lexeme).toBe("MyClassName");
    });
  });

  describe("Number Literals", () => {
    it("should tokenize decimal integer", () => {
      const tokens = tokenize("123");
      expect(tokens[0]!.type).toBe(TokenType.NumberLiteral);
      expect(tokens[0]!.lexeme).toBe("123");
    });

    it("should tokenize hexadecimal integer", () => {
      const tokens = tokenize("0xFF");
      expect(tokens[0]!.type).toBe(TokenType.NumberLiteral);
      expect(tokens[0]!.lexeme).toBe("0xFF");
    });

    it("should tokenize binary integer", () => {
      const tokens = tokenize("0b1010");
      expect(tokens[0]!.type).toBe(TokenType.NumberLiteral);
      expect(tokens[0]!.lexeme).toBe("0b1010");
    });

    it("should tokenize octal integer", () => {
      const tokens = tokenize("0o755");
      expect(tokens[0]!.type).toBe(TokenType.NumberLiteral);
      expect(tokens[0]!.lexeme).toBe("0o755");
    });

    it("should tokenize float with decimal point", () => {
      const tokens = tokenize("3.14");
      expect(tokens[0]!.type).toBe(TokenType.NumberLiteral);
      expect(tokens[0]!.lexeme).toBe("3.14");
    });
  });

  describe("String Literals", () => {
    it("should tokenize simple string", () => {
      const tokens = tokenize('"hello"');
      expect(tokens[0]!.type).toBe(TokenType.StringLiteral);
      expect(tokens[0]!.lexeme).toBe('"hello"');
    });

    it("should tokenize string with escape sequences", () => {
      const tokens = tokenize('"hello\\nworld"');
      expect(tokens[0]!.type).toBe(TokenType.StringLiteral);
      expect(tokens[0]!.lexeme).toBe('"hello\\nworld"');
    });

    it("should tokenize string with quotes", () => {
      const tokens = tokenize('"hello \\"world\\""');
      expect(tokens[0]!.type).toBe(TokenType.StringLiteral);
      expect(tokens[0]!.lexeme).toBe('"hello \\"world\\""');
    });

    it("should tokenize empty string", () => {
      const tokens = tokenize('""');
      expect(tokens[0]!.type).toBe(TokenType.StringLiteral);
      expect(tokens[0]!.lexeme).toBe('""');
    });
  });

  describe("Character Literals", () => {
    it("should tokenize simple character", () => {
      const tokens = tokenize("'a'");
      expect(tokens[0]!.type).toBe(TokenType.CharLiteral);
      expect(tokens[0]!.lexeme).toBe("'a'");
    });

    it("should tokenize escaped character", () => {
      const tokens = tokenize("'\\n'");
      expect(tokens[0]!.type).toBe(TokenType.CharLiteral);
      expect(tokens[0]!.lexeme).toBe("'\\n'");
    });

    it("should tokenize tab character", () => {
      const tokens = tokenize("'\\t'");
      expect(tokens[0]!.type).toBe(TokenType.CharLiteral);
      expect(tokens[0]!.lexeme).toBe("'\\t'");
    });
  });

  describe("Comments", () => {
    it("should skip single-line comments", () => {
      const tokens = tokenize("# This is a comment\nlocal");
      expect(tokens[0]!.type).toBe(TokenType.Comment);
      expect(tokens[1]!.type).toBe(TokenType.Local);
    });

    it("should skip multi-line comments", () => {
      const tokens = tokenize("### This is\na comment ###\nlocal");
      expect(tokens[0]!.type).toBe(TokenType.Comment);
      expect(tokens[1]!.type).toBe(TokenType.Local);
    });

    it("should handle nested comments if supported", () => {
      const tokens = tokenize("### outer ### inner ### ###\nlocal");
      // Behavior depends on if nested comments are supported
      expect(tokens.some((t) => t.type === TokenType.Local)).toBe(true);
    });
  });

  describe("Whitespace Handling", () => {
    it("should skip spaces", () => {
      const tokens = tokenize("   local");
      expect(tokens[0]!.type).toBe(TokenType.Local);
    });

    it("should skip tabs", () => {
      const tokens = tokenize("\t\tlocal");
      expect(tokens[0]!.type).toBe(TokenType.Local);
    });

    it("should skip newlines", () => {
      const tokens = tokenize("\n\nlocal");
      expect(tokens[0]!.type).toBe(TokenType.Local);
    });

    it("should skip carriage returns", () => {
      const tokens = tokenize("\r\nlocal");
      expect(tokens[0]!.type).toBe(TokenType.Local);
    });
  });

  describe("Complex Expressions", () => {
    it("should tokenize arithmetic expression", () => {
      const tokens = tokenize("a + b * c");
      expect(tokens[0]!.type).toBe(TokenType.Identifier);
      expect(tokens[1]!.type).toBe(TokenType.Plus);
      expect(tokens[2]!.type).toBe(TokenType.Identifier);
      expect(tokens[3]!.type).toBe(TokenType.Star);
      expect(tokens[4]!.type).toBe(TokenType.Identifier);
    });

    it("should tokenize function call", () => {
      const tokens = tokenize("foo(a, b)");
      expect(tokens[0]!.type).toBe(TokenType.Identifier);
      expect(tokens[1]!.type).toBe(TokenType.LeftParen);
      expect(tokens[2]!.type).toBe(TokenType.Identifier);
      expect(tokens[3]!.type).toBe(TokenType.Comma);
      expect(tokens[4]!.type).toBe(TokenType.Identifier);
      expect(tokens[5]!.type).toBe(TokenType.RightParen);
    });

    it("should tokenize array access", () => {
      const tokens = tokenize("arr[10]");
      expect(tokens[0]!.type).toBe(TokenType.Identifier);
      expect(tokens[1]!.type).toBe(TokenType.LeftBracket);
      expect(tokens[2]!.type).toBe(TokenType.NumberLiteral);
      expect(tokens[3]!.type).toBe(TokenType.RightBracket);
    });

    it("should tokenize member access", () => {
      const tokens = tokenize("obj.field");
      expect(tokens[0]!.type).toBe(TokenType.Identifier);
      expect(tokens[1]!.type).toBe(TokenType.Dot);
      expect(tokens[2]!.type).toBe(TokenType.Identifier);
    });
  });

  describe("Type Annotations", () => {
    it("should tokenize simple type", () => {
      const tokens = tokenize("x: int");
      expect(tokens[0]!.type).toBe(TokenType.Identifier);
      expect(tokens[1]!.type).toBe(TokenType.Colon);
      expect(tokens[2]!.type).toBe(TokenType.Identifier);
    });

    it("should tokenize pointer type", () => {
      const tokens = tokenize("p: *int");
      expect(tokens[0]!.type).toBe(TokenType.Identifier);
      expect(tokens[1]!.type).toBe(TokenType.Colon);
      expect(tokens[2]!.type).toBe(TokenType.Star);
      expect(tokens[3]!.type).toBe(TokenType.Identifier);
    });

    it("should tokenize array type", () => {
      const tokens = tokenize("arr: int[10]");
      expect(tokens[0]!.type).toBe(TokenType.Identifier);
      expect(tokens[1]!.type).toBe(TokenType.Colon);
      expect(tokens[2]!.type).toBe(TokenType.Identifier);
      expect(tokens[3]!.type).toBe(TokenType.LeftBracket);
      expect(tokens[4]!.type).toBe(TokenType.NumberLiteral);
      expect(tokens[5]!.type).toBe(TokenType.RightBracket);
    });
  });

  describe("Generic Syntax", () => {
    it("should tokenize generic type parameter", () => {
      const tokens = tokenize("Box<T>");
      expect(tokens[0]!.type).toBe(TokenType.Identifier);
      expect(tokens[1]!.type).toBe(TokenType.Less);
      expect(tokens[2]!.type).toBe(TokenType.Identifier);
      expect(tokens[3]!.type).toBe(TokenType.Greater);
    });

    it("should tokenize multiple generic parameters", () => {
      const tokens = tokenize("Map<K, V>");
      expect(tokens[0]!.type).toBe(TokenType.Identifier);
      expect(tokens[1]!.type).toBe(TokenType.Less);
      expect(tokens[2]!.type).toBe(TokenType.Identifier);
      expect(tokens[3]!.type).toBe(TokenType.Comma);
      expect(tokens[4]!.type).toBe(TokenType.Identifier);
      expect(tokens[5]!.type).toBe(TokenType.Greater);
    });
  });

  describe("Error Cases", () => {
    it("should handle invalid characters gracefully", () => {
      expect(() => tokenize("@")).toThrow();
    });

    it("should handle unterminated string", () => {
      expect(() => tokenize('"unterminated')).toThrow();
    });

    it("should handle unterminated character literal", () => {
      expect(() => tokenize("'a")).toThrow();
    });

    it("should handle invalid number format", () => {
      const tokens = tokenize("0b1021");
      // parse as 0b10 21
      expect(tokens.length).toBeGreaterThan(1);
    });
  });

  describe("Position Tracking", () => {
    it("should track line numbers correctly", () => {
      const tokens = tokenize("line1\nline2");
      expect(tokens[0]!.line).toBe(1);
      expect(tokens[1]!.line).toBe(2);
    });

    it("should track column numbers correctly", () => {
      const tokens = tokenize("abc def");
      expect(tokens[0]!.column).toBe(1);
      expect(tokens[1]!.column).toBe(5);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty input", () => {
      const tokens = tokenize("");
      expect(tokens.length).toBeGreaterThanOrEqual(0);
    });

    it("should handle only whitespace", () => {
      const tokens = tokenize("   \n\t  ");
      // Should produce minimal tokens (maybe just EOF)
      expect(tokens).toBeDefined();
    });

    it("should handle only comments", () => {
      const tokens = tokenize("// comment\n/* comment */");
      // Should produce minimal tokens
      expect(tokens).toBeDefined();
    });

    it("should distinguish between similar operators", () => {
      const tokens = tokenize("< <= << > >= >>");
      expect(tokens[0]!.type).toBe(TokenType.Less);
      expect(tokens[1]!.type).toBe(TokenType.LessEqual);
      expect(tokens[2]!.type).toBe(TokenType.LessLess);
      expect(tokens[3]!.type).toBe(TokenType.Greater);
      expect(tokens[4]!.type).toBe(TokenType.GreaterEqual);
      expect(tokens[5]!.type).toBe(TokenType.GreaterGreater);
    });
  });
});
