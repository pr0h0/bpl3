# Scanner implementation

export [Scanner];

import [SourceFile] from "./source_reader.bpl";
import [Token] from "./token.bpl";
import [TokenKind] from "./token.bpl";
import [DiagnosticReporter] from "std/diagnostics.bpl";
import [DiagnosticLevel] from "std/diagnostics.bpl";
import [Span] from "std/diagnostics.bpl";
import [CharUtils] from "std/char_utils.bpl";
import [String] from "std/string.bpl";

struct Scanner {
    file: *SourceFile,
    pos: int,
    start: int,
    line: int,
    col: int,
    reporter: *DiagnosticReporter,

    frame new(file: *SourceFile, reporter: *DiagnosticReporter) ret Scanner {
        local s: Scanner;
        s.file = file;
        s.pos = 0;
        s.start = 0;
        s.line = 1;
        s.col = 1;
        s.reporter = reporter;
        return s;
    }

    frame isAtEnd(this: *Scanner) ret bool {
        return this.pos >= this.file.content.length;
    }

    frame advance(this: *Scanner) ret char {
        if (this.isAtEnd()) 
            return cast<char>(0);
        local c: char = this.file.content.get(this.pos);
        this.pos = this.pos + 1;
        this.col = this.col + 1;
        if (c == '\n') {
            this.line = this.line + 1;
            this.col = 1;
        }
        return c;
    }

    frame peek(this: *Scanner) ret char {
        if (this.isAtEnd()) 
            return cast<char>(0);
        return this.file.content.get(this.pos);
    }

    frame skipWhitespace(this: *Scanner) {
        loop (!this.isAtEnd()) {
            local c: char = this.peek();
            if ((c == ' ') || (c == '\t') || (c == '\r') || (c == '\n')) {
                this.advance();
            } else {
                if (c == '#') {
                    loop (!this.isAtEnd() && (this.peek() != '\n')) {
                        this.advance();
                    }
                } else {
                    break;
                }
            }
        }
    }

    frame next(this: *Scanner) ret Token {
        this.skipWhitespace();
        this.start = this.pos;

        if (this.isAtEnd()) {
            local span: Span = Span.new(this.file.path.cstr(), this.pos, this.pos, this.line, this.col);
            return Token.new(TokenKind.EndOfFile, "", span);
        }
        local c: char = this.advance();

        if (CharUtils.isAlpha(c) || (c == '_')) {
            return this._scanIdentifier();
        }
        if (CharUtils.isDigit(c)) {
            return this._scanNumber();
        }
        local span: Span = Span.new(this.file.path.cstr(), this.start, this.pos, this.line, this.col);

        if (c == '(') 
            return Token.new(TokenKind.OpenParen, "(", span);
        if (c == ')') 
            return Token.new(TokenKind.CloseParen, ")", span);
        if (c == '{') 
            return Token.new(TokenKind.OpenBrace, "{", span);
        if (c == '}') 
            return Token.new(TokenKind.CloseBrace, "}", span);
        if (c == ';') 
            return Token.new(TokenKind.Semicolon, ";", span);
        if (c == ',') 
            return Token.new(TokenKind.Comma, ",", span);
        if (c == '+') 
            return Token.new(TokenKind.Plus, "+", span);
        if (c == '-') 
            return Token.new(TokenKind.Minus, "-", span);
        if (c == '*') 
            return Token.new(TokenKind.Star, "*", span);
        if (c == '/') 
            return Token.new(TokenKind.Slash, "/", span);
        if (c == '=') 
            return Token.new(TokenKind.Assign, "=", span);
        local t: Token = Token.new(TokenKind.Error, "Unexpected character", span);
        return t;
    }

    frame _scanIdentifier(this: *Scanner) ret Token {
        loop (CharUtils.isAlphaNumeric(this.peek()) || (this.peek() == '_')) {
            this.advance();
        }

        local text: String = this.file.content.substring(this.start, this.pos - this.start);
        local span: Span = Span.new(this.file.path.cstr(), this.start, this.pos, this.line, this.col);
        local kind: TokenKind = this._getKeywordKind(text);

        local t: Token = Token.new(kind, text.cstr(), span);
        text.destroy();
        return t;
    }

    frame _getKeywordKind(this: *Scanner, text: String) ret TokenKind {
        if (text == "frame") 
            return TokenKind.KwFrame;
        if (text == "struct") 
            return TokenKind.KwStruct;
        if (text == "enum") 
            return TokenKind.KwEnum;
        if (text == "spec") 
            return TokenKind.KwSpec;
        if (text == "type") 
            return TokenKind.KwType;
        if (text == "const") 
            return TokenKind.KwConst;
        if (text == "local") 
            return TokenKind.KwLocal;
        if (text == "global") 
            return TokenKind.KwGlobal;
        if (text == "if") 
            return TokenKind.KwIf;
        if (text == "else") 
            return TokenKind.KwElse;
        if (text == "loop") 
            return TokenKind.KwLoop;
        if (text == "break") 
            return TokenKind.KwBreak;
        if (text == "continue") 
            return TokenKind.KwContinue;
        if (text == "return") 
            return TokenKind.KwReturn;
        if (text == "defer") 
            return TokenKind.KwDefer;
        if (text == "match") 
            return TokenKind.KwMatch;
        if (text == "switch") 
            return TokenKind.KwSwitch;
        if (text == "case") 
            return TokenKind.KwCase;
        if (text == "default") 
            return TokenKind.KwDefault;
        if (text == "try") 
            return TokenKind.KwTry;
        if (text == "catch") 
            return TokenKind.KwCatch;
        if (text == "throw") 
            return TokenKind.KwThrow;
        if (text == "import") 
            return TokenKind.KwImport;
        if (text == "export") 
            return TokenKind.KwExport;
        if (text == "from") 
            return TokenKind.KwFrom;
        if (text == "as") 
            return TokenKind.KwAs;
        if (text == "true") 
            return TokenKind.KwTrue;
        if (text == "false") 
            return TokenKind.KwFalse;
        if (text == "nullptr") 
            return TokenKind.KwNullptr;
        if (text == "void") 
            return TokenKind.KwVoid;
        if (text == "int") 
            return TokenKind.KwInt;
        if (text == "float") 
            return TokenKind.KwFloat;
        if (text == "bool") 
            return TokenKind.KwBool;
        if (text == "char") 
            return TokenKind.KwChar;
        if (text == "string") 
            return TokenKind.KwString;
        if (text == "ushort") 
            return TokenKind.KwUshort;
        if (text == "uint") 
            return TokenKind.KwUint;
        if (text == "ulong") 
            return TokenKind.KwUlong;
        if (text == "extern") 
            return TokenKind.KwExtern;
        if (text == "asm") 
            return TokenKind.KwAsm;
        if (text == "cast") 
            return TokenKind.KwCast;
        if (text == "sizeof") 
            return TokenKind.KwSizeof;
        if (text == "is") 
            return TokenKind.KwIs;
        if (text == "offsetof") 
            return TokenKind.KwOffsetof;
        if (text == "typeof") 
            return TokenKind.KwTypeof;
        return TokenKind.Identifier;
    }

    frame _scanNumber(this: *Scanner) ret Token {
        loop (CharUtils.isDigit(this.peek())) {
            this.advance();
        }
        local text: String = this.file.content.substring(this.start, this.pos - this.start);
        local span: Span = Span.new(this.file.path.cstr(), this.start, this.pos, this.line, this.col);
        local t: Token = Token.new(TokenKind.Number, text.cstr(), span);
        text.destroy();
        return t;
    }
}
