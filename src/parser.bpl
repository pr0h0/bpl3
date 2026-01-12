export [Parser];

import [Scanner] from "./scanner.bpl";
import [Token] from "./token.bpl";
import [TokenKind] from "./token.bpl";
import [Span] from "std/diagnostics.bpl";
import [DiagnosticReporter] from "std/diagnostics.bpl";
import [DiagnosticLevel] from "std/diagnostics.bpl";
import [ArenaAllocator] from "../lib/memory/arena_allocator.bpl";
import [String] from "std/string.bpl";
import [Node] from "./ast.bpl";

extern memset(ptr: *void, val: int, size: ulong) ret *void;

struct Parser {
    scanner: Scanner,
    reporter: *DiagnosticReporter,
    arena: *ArenaAllocator,
    current: Token,
    previous: Token,
    hadError: bool,
    panicMode: bool,

    frame new(scanner: Scanner, reporter: *DiagnosticReporter, arena: *ArenaAllocator) ret Parser {
        local p: Parser;

        # Initialize tokens to safe state (allocating empty strings)
        # We use dummy values that are safe to destroy
        local emptySpan: Span = Span.new("", 0, 0, 0, 0);
        p.current = Token.new(TokenKind.Error, "", emptySpan);
        emptySpan.destroy(); # Token.new deep copies span file, so we destroy local one

        local emptySpan2: Span = Span.new("", 0, 0, 0, 0);
        p.previous = Token.new(TokenKind.Error, "", emptySpan2);
        emptySpan2.destroy();

        p.scanner = scanner;
        p.reporter = reporter;
        p.arena = arena;
        p.hadError = false;
        p.panicMode = false;
        return p;
    }

    frame destroy(this: *Parser) {
        this.current.destroy();
        this.previous.destroy();
    }

    frame init(this: *Parser) {
        this.advance();
    }

    frame advance(this: *Parser) {
        this.previous.destroy();
        this.previous = this.current;

        loop {
            this.current = this.scanner.next();
            if (this.current.kind != TokenKind.Error) {
                break;
            }
            this.errorAtCurrent(this.current.text.data);
            this.current.destroy();
        }
    }

    frame errorAtCurrent(this: *Parser, msg: string) {
        this.errorAt(&this.current, msg);
    }

    frame error(this: *Parser, msg: string) {
        this.errorAt(&this.previous, msg);
    }

    frame errorAt(this: *Parser, token: *Token, msg: string) {
        if (this.panicMode)
            return;
        this.panicMode = true;
        this.hadError = true;

        this.reporter.report(DiagnosticLevel.Error, msg, token.span);
    }

    frame check(this: *Parser, kind: TokenKind) ret bool {
        return this.current.kind == kind;
    }

    frame consume(this: *Parser, kind: TokenKind, msg: string) {
        if (this.current.kind == kind) {
            this.advance();
            return;
        }
        this.errorAtCurrent(msg);
    }

    frame matchToken(this: *Parser, kind: TokenKind) ret bool {
        if (this.check(kind)) {
            this.advance();
            return true;
        }
        return false;
    }

    frame synchronize(this: *Parser) {
        # ... (implementation) ...
    }

    # Entry point
    frame parse(this: *Parser) ret *Node {

        # Stub: Return dummy
        return nullptr;
    }
}
