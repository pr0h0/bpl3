# Token definitions

export [Token];
export [TokenKind];

import [Span] from "std/diagnostics.bpl";
import [String] from "std/string.bpl";

enum TokenKind {
    EndOfFile,
    Error,

    # Identifiers & Literals
    Identifier,
    Number, # Integer or Float
    String,
    Char,

    # Keywords
    KwFrame,
    KwStruct,
    KwEnum,
    KwSpec,
    KwType,
    KwConst,
    KwLocal,
    KwGlobal,
    KwIf,
    KwElse,
    KwLoop,
    KwBreak,
    KwContinue,
    KwReturn,
    KwDefer,
    KwMatch,
    KwSwitch,
    KwCase,
    KwDefault,
    KwTry,
    KwCatch,
    KwThrow,
    KwImport,
    KwExport,
    KwFrom,
    KwAs,
    KwTrue,
    KwFalse,
    KwNullptr,
    KwVoid,
    KwInt,
    KwFloat,
    KwBool,
    KwChar,
    KwString,
    KwUshort,
    KwUint,
    KwUlong,
    KwExtern,
    KwAsm,
    KwCast,
    KwSizeof,
    KwIs,
    KwOffsetof,
    KwTypeof,

    # Operators & Punctuation
    Plus,
    Minus,
    Star,
    Slash,
    Percent,
    Eq,
    Neq,
    Lt,
    Le,
    Gt,
    Ge,
    Assign,
    OpenParen,
    CloseParen,
    OpenBrace,
    CloseBrace,
    OpenBracket,
    CloseBracket,
    Comma,
    Semicolon,
    Colon,
    Dot,
    Arrow,
    Ampersand,
    Pipe,
    Caret,
    Tilde,
    Bang,
    Question,
}

struct Token {
    kind: TokenKind,
    text: String,
    span: Span,

    frame new(kind: TokenKind, text: string, span: Span) ret Token {
        local t: Token;
        t.kind = kind;
        t.text = String.new(text);
        t.span = span;
        # Deep copy span's file string
        t.span.file = span.file.clone();
        return t;
    }

    frame destroy(this: *Token) {
        this.text.destroy();
        this.span.destroy();
    }

    frame clone(this: *Token) ret Token {
        local t: Token;
        t.kind = this.kind;
        t.text = this.text.clone();
        t.span = this.span;
        t.span.file = this.span.file.clone();
        return t;
    }
}
