# QScript lexer.
#
# QScript is the small strategy language users POST to /api/strategy/run.
# Tokens: numbers (decimal with optional fraction/exponent), strings with
# escapes, identifiers, keywords, operators and punctuation. `#` starts a
# line comment. Positions are tracked as 1-based line/column for errors.

import malloc, free, memcpy from "std/c.bpl";
import [Text], [ParsedFloat] from "../core/text.bpl";

export [Lexer];
export [Tok];
export [TokType];

enum TokType {
    Eof,
    Number,
    String,
    Ident,
    # Keywords
    Let,
    Fn,
    If,
    Elif,
    Else,
    While,
    For,
    In,
    Return,
    Break,
    Continue,
    True,
    False,
    Nil,
    And,
    Or,
    Not,
    # Operators
    Plus,
    Minus,
    Star,
    Slash,
    Percent,
    Power,
    Assign,
    PlusAssign,
    MinusAssign,
    StarAssign,
    SlashAssign,
    Eq,
    Ne,
    Lt,
    Le,
    Gt,
    Ge,
    DotDot,
    # Punctuation
    LParen,
    RParen,
    LBracket,
    RBracket,
    LBrace,
    RBrace,
    Comma,
    Semicolon,
    Colon,
    Error,
}

struct Tok {
    kind: TokType,
    start: int,
    len: int,
    line: int,
    col: int,
    num: float,
}

struct Lexer {
    src: string,
    len: int,
    pos: int,
    line: int,
    col: int,
    toks: *Tok,
    count: int,
    cap: int,
    error: string,
    error_line: int,
    error_col: int,

    frame tokenize(src: string) ret Lexer {
        local l: Lexer;
        l.src = src;
        l.len = Text.length(src);
        l.pos = 0;
        l.line = 1;
        l.col = 1;
        l.cap = 64;
        l.count = 0;
        l.toks = cast<*Tok>(malloc(cast<long>(l.cap) * sizeof(Tok)));
        l.error = nullptr;
        l.error_line = 0;
        l.error_col = 0;
        l.run();
        return l;
    }

    frame destroy(this: *Lexer) {
        if (this.toks != nullptr) {
            free(cast<*void>(this.toks));
            this.toks = nullptr;
        }
    }

    frame ok(this: *Lexer) ret bool {
        return this.error == nullptr;
    }

    frame fail(this: *Lexer, message: string) {
        if (this.error == nullptr) {
            this.error = message;
            this.error_line = this.line;
            this.error_col = this.col;
        }
    }

    frame peekChar(this: *Lexer, offset: int) ret char {
        local p: int = this.pos + offset;
        if (p >= this.len) {
            return cast<char>(0);
        }
        return this.src[p];
    }

    frame bump(this: *Lexer) ret char {
        local c: char = this.src[this.pos];
        this.pos = this.pos + 1;
        if (c == '\n') {
            this.line = this.line + 1;
            this.col = 1;
        } else {
            this.col = this.col + 1;
        }
        return c;
    }

    frame push(this: *Lexer, kind: TokType, start: int, line: int, col: int, num: float) {
        if (this.count == this.cap) {
            local next_cap: int = this.cap * 2;
            local next: *Tok = cast<*Tok>(malloc(cast<long>(next_cap) * sizeof(Tok)));
            memcpy(cast<*void>(next), cast<*void>(this.toks), cast<long>(this.count) * sizeof(Tok));
            free(cast<*void>(this.toks));
            this.toks = next;
            this.cap = next_cap;
        }
        this.toks[this.count] = Tok { kind: kind, start: start, len: this.pos - start, line: line, col: col, num: num };
        this.count = this.count + 1;
    }

    frame keyword(this: *Lexer, start: int, n: int) ret TokType {
        local words: string[16] = ["let", "fn", "if", "elif", "else", "while", "for", "in", "return", "break", "continue", "true", "false", "nil", "and", "or"];
        local kinds: TokType[16] = [TokType.Let, TokType.Fn, TokType.If, TokType.Elif, TokType.Else, TokType.While, TokType.For, TokType.In, TokType.Return, TokType.Break, TokType.Continue, TokType.True, TokType.False, TokType.Nil, TokType.And, TokType.Or];
        loop (local i: int = 0; i < 16; i = i + 1) {
            if ((Text.length(words[i]) == n) && this.matchAt(start, words[i], n)) {
                return kinds[i];
            }
        }
        if ((n == 3) && this.matchAt(start, "not", 3)) {
            return TokType.Not;
        }
        return TokType.Ident;
    }

    frame matchAt(this: *Lexer, start: int, word: string, n: int) ret bool {
        loop (local i: int = 0; i < n; i = i + 1) {
            if (this.src[start + i] != word[i]) {
                return false;
            }
        }
        return true;
    }

    frame run(this: *Lexer) {
        loop ((this.pos < this.len) && (this.error == nullptr)) {
            local c: char = this.peekChar(0);
            if ((c == ' ') || (c == '\t') || (c == '\r') || (c == '\n')) {
                this.bump();
                continue;
            }
            if (c == '#') {
                loop ((this.pos < this.len) && (this.peekChar(0) != '\n')) {
                    this.bump();
                }
                continue;
            }
            local start: int = this.pos;
            local line: int = this.line;
            local col: int = this.col;
            if (Text.isDigit(c)) {
                this.number(start, line, col);
                continue;
            }
            if (c == '"') {
                this.string(start, line, col);
                continue;
            }
            if (Text.isIdentStart(c)) {
                loop ((this.pos < this.len) && (Text.isAlnum(this.peekChar(0)) || (this.peekChar(0) == '_'))) {
                    this.bump();
                }
                this.push(this.keyword(start, this.pos - start), start, line, col, 0.0);
                continue;
            }
            this.bump();
            local next: char = this.peekChar(0);
            local kind: TokType = TokType.Error;
            if (c == '+') {
                kind = TokType.Plus;
                if (next == '=') {
                    this.bump();
                    kind = TokType.PlusAssign;
                }
            } else if (c == '-') {
                kind = TokType.Minus;
                if (next == '=') {
                    this.bump();
                    kind = TokType.MinusAssign;
                }
            } else if (c == '*') {
                kind = TokType.Star;
                if (next == '*') {
                    this.bump();
                    kind = TokType.Power;
                } else if (next == '=') {
                    this.bump();
                    kind = TokType.StarAssign;
                }
            } else if (c == '/') {
                kind = TokType.Slash;
                if (next == '=') {
                    this.bump();
                    kind = TokType.SlashAssign;
                }
            } else if (c == '%') {
                kind = TokType.Percent;
            } else if (c == '=') {
                kind = TokType.Assign;
                if (next == '=') {
                    this.bump();
                    kind = TokType.Eq;
                }
            } else if (c == '!') {
                if (next == '=') {
                    this.bump();
                    kind = TokType.Ne;
                } else {
                    kind = TokType.Not;
                }
            } else if (c == '<') {
                kind = TokType.Lt;
                if (next == '=') {
                    this.bump();
                    kind = TokType.Le;
                }
            } else if (c == '>') {
                kind = TokType.Gt;
                if (next == '=') {
                    this.bump();
                    kind = TokType.Ge;
                }
            } else if (c == '.') {
                if (next == '.') {
                    this.bump();
                    kind = TokType.DotDot;
                }
            } else if (c == '(') {
                kind = TokType.LParen;
            } else if (c == ')') {
                kind = TokType.RParen;
            } else if (c == '[') {
                kind = TokType.LBracket;
            } else if (c == ']') {
                kind = TokType.RBracket;
            } else if (c == '{') {
                kind = TokType.LBrace;
            } else if (c == '}') {
                kind = TokType.RBrace;
            } else if (c == ',') {
                kind = TokType.Comma;
            } else if (c == ';') {
                kind = TokType.Semicolon;
            } else if (c == ':') {
                kind = TokType.Colon;
            }
            if (kind == TokType.Error) {
                this.line = line;
                this.col = col;
                this.fail("unexpected character");
                return;
            }
            this.push(kind, start, line, col, 0.0);
        }
        this.push(TokType.Eof, this.pos, this.line, this.col, 0.0);
    }

    frame number(this: *Lexer, start: int, line: int, col: int) {
        loop (Text.isDigit(this.peekChar(0))) {
            this.bump();
        }
        # A '.' followed by a digit is a fraction; '..' is a range operator.
        if ((this.peekChar(0) == '.') && Text.isDigit(this.peekChar(1))) {
            this.bump();
            loop (Text.isDigit(this.peekChar(0))) {
                this.bump();
            }
        }
        if ((this.peekChar(0) == 'e') || (this.peekChar(0) == 'E')) {
            local save_pos: int = this.pos;
            local save_col: int = this.col;
            this.bump();
            if ((this.peekChar(0) == '+') || (this.peekChar(0) == '-')) {
                this.bump();
            }
            if (!Text.isDigit(this.peekChar(0))) {
                this.pos = save_pos;
                this.col = save_col;
            } else {
                loop (Text.isDigit(this.peekChar(0))) {
                    this.bump();
                }
            }
        }
        local text: string = Text.copyN(cast<string>(cast<*char>(this.src) + start), this.pos - start);
        local p: ParsedFloat = Text.parseFloat(text);
        Text.release(text);
        if (!p.ok) {
            this.fail("invalid number");
            return;
        }
        this.push(TokType.Number, start, line, col, p.value);
    }

    frame string(this: *Lexer, start: int, line: int, col: int) {
        this.bump();
        loop {
            if (this.pos >= this.len) {
                this.line = line;
                this.col = col;
                this.fail("unterminated string");
                return;
            }
            local c: char = this.bump();
            if (c == '"') {
                break;
            }
            if (c == '\\') {
                if (this.pos >= this.len) {
                    this.fail("unterminated escape");
                    return;
                }
                this.bump();
            }
        }
        this.push(TokType.String, start, line, col, 0.0);
    }

    frame text(this: *Lexer, t: *Tok) ret string {
        return Text.copyN(cast<string>(cast<*char>(this.src) + t.start), t.len);
    }

    frame tokName(kind: TokType) ret string {
        return match (kind) {
            TokType.Eof => "end of input",
            TokType.Number => "number",
            TokType.String => "string",
            TokType.Ident => "identifier",
            TokType.LParen => "'('",
            TokType.RParen => "')'",
            TokType.LBracket => "'['",
            TokType.RBracket => "']'",
            TokType.LBrace => "'{'",
            TokType.RBrace => "'}'",
            TokType.Comma => "','",
            TokType.Semicolon => "';'",
            TokType.Assign => "'='",
            _ => "token",
        };
    }
}
