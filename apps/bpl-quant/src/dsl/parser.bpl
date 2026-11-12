# QScript parser: tokens to an AST stored in a flat node array.
#
#   program   := stmt*
#   stmt      := "let" IDENT "=" expr ";"
#              | "fn" IDENT "(" params ")" block
#              | "if" expr block ("elif" expr block)* ("else" block)?
#              | "while" expr block
#              | "for" IDENT "in" expr (".." expr)? block
#              | "return" expr? ";" | "break" ";" | "continue" ";"
#              | target ("=" | "+=" | "-=" | "*=" | "/=") expr ";"
#              | expr ";"
#   expr      := or ; or := and ("or" and)* ; and := not ("and" not)*
#   not       := "not" not | cmp ; cmp := sum (cmpop sum)?
#   sum       := term (("+"|"-") term)* ; term := unary (("*"|"/"|"%") unary)*
#   unary     := "-" unary | power ; power := postfix ("**" unary)?
#   postfix   := primary ("(" args ")" | "[" expr "]")*
#   primary   := NUMBER | STRING | true | false | nil | IDENT | "(" expr ")" | "[" args "]"
#
# Semicolons are required after simple statements, which keeps error
# messages precise.

import malloc, free, memcpy from "std/c.bpl";
import [Text] from "../core/text.bpl";
import [Lexer], [Tok], [TokType] from "./lexer.bpl";

export [Parser];
export [Ast];
export [AstNode];
export [NodeType];

global const MAX_DEPTH: int = 200;

enum NodeType {
    Number,
    String,
    Bool,
    Nil,
    Var,
    ArrayLit,
    Index,
    Call,
    Unary,
    Binary,
    Logical,
    Let,
    Assign,
    IndexAssign,
    If,
    While,
    ForRange,
    ForEach,
    Function,
    Return,
    Break,
    Continue,
    ExprStmt,
    Block,
}

struct AstNode {
    kind: NodeType,
    op: TokType,
    num: float,
    name: string,
    a: int,
    b: int,
    c: int,
    d: int,
    first: int,
    next: int,
    count: int,
    line: int,
    col: int,
}

struct Ast {
    nodes: *AstNode,
    count: int,
    cap: int,
    root: int,

    frame new() ret Ast {
        local a: Ast;
        a.cap = 128;
        a.count = 0;
        a.nodes = cast<*AstNode>(malloc(cast<long>(a.cap) * sizeof(AstNode)));
        a.root = -1;
        return a;
    }

    frame destroy(this: *Ast) {
        loop (local i: int = 0; i < this.count; i = i + 1) {
            if (this.nodes[i].name != nullptr) {
                Text.release(this.nodes[i].name);
            }
        }
        if (this.nodes != nullptr) {
            free(cast<*void>(this.nodes));
            this.nodes = nullptr;
        }
    }

    frame add(this: *Ast, kind: NodeType, line: int, col: int) ret int {
        if (this.count == this.cap) {
            local next_cap: int = this.cap * 2;
            local next: *AstNode = cast<*AstNode>(malloc(cast<long>(next_cap) * sizeof(AstNode)));
            memcpy(cast<*void>(next), cast<*void>(this.nodes), cast<long>(this.count) * sizeof(AstNode));
            free(cast<*void>(this.nodes));
            this.nodes = next;
            this.cap = next_cap;
        }
        local idx: int = this.count;
        this.count = this.count + 1;
        this.nodes[idx] = AstNode { kind: kind, op: TokType.Eof, num: 0.0, name: nullptr, a: -1, b: -1, c: -1, d: -1, first: -1, next: -1, count: 0, line: line, col: col };
        return idx;
    }

    frame at(this: *Ast, idx: int) ret *AstNode {
        return this.nodes + idx;
    }

    # Appends child to the list headed by node.first; node.d tracks the tail.
    frame append(this: *Ast, node: int, child: int) {
        if (this.nodes[node].first < 0) {
            this.nodes[node].first = child;
        } else {
            this.nodes[this.nodes[node].d].next = child;
        }
        this.nodes[node].d = child;
        this.nodes[node].count = this.nodes[node].count + 1;
    }
}

struct Parser {
    lex: Lexer,
    ast: Ast,
    pos: int,
    error: string,
    error_line: int,
    error_col: int,
    depth: int,

    frame parse(src: string) ret Parser {
        local p: Parser;
        p.lex = Lexer.tokenize(src);
        p.ast = Ast.new();
        p.pos = 0;
        p.error = nullptr;
        p.error_line = 0;
        p.error_col = 0;
        p.depth = 0;
        if (!p.lex.ok()) {
            p.error = p.lex.error;
            p.error_line = p.lex.error_line;
            p.error_col = p.lex.error_col;
            return p;
        }
        local root: int = p.ast.add(NodeType.Block, 1, 1);
        p.ast.root = root;
        loop ((p.error == nullptr) && (p.peek().kind != TokType.Eof)) {
            local s: int = p.statement();
            if (s >= 0) {
                p.ast.append(root, s);
            }
        }
        return p;
    }

    frame destroy(this: *Parser) {
        this.lex.destroy();
        this.ast.destroy();
    }

    frame ok(this: *Parser) ret bool {
        return this.error == nullptr;
    }

    frame peek(this: *Parser) ret Tok {
        return this.lex.toks[this.pos];
    }

    frame peekAt(this: *Parser, offset: int) ret Tok {
        local p: int = this.pos + offset;
        if (p >= this.lex.count) {
            p = this.lex.count - 1;
        }
        return this.lex.toks[p];
    }

    frame advance(this: *Parser) ret Tok {
        local t: Tok = this.lex.toks[this.pos];
        if (t.kind != TokType.Eof) {
            this.pos = this.pos + 1;
        }
        return t;
    }

    frame check(this: *Parser, kind: TokType) ret bool {
        return this.peek().kind == kind;
    }

    frame accept(this: *Parser, kind: TokType) ret bool {
        if (this.check(kind)) {
            this.advance();
            return true;
        }
        return false;
    }

    frame failAt(this: *Parser, t: Tok, message: string) {
        if (this.error == nullptr) {
            this.error = message;
            this.error_line = t.line;
            this.error_col = t.col;
        }
    }

    frame expect(this: *Parser, kind: TokType, message: string) ret bool {
        if (this.check(kind)) {
            this.advance();
            return true;
        }
        this.failAt(this.peek(), message);
        return false;
    }

    frame enter(this: *Parser) ret bool {
        this.depth = this.depth + 1;
        if (this.depth > MAX_DEPTH) {
            this.failAt(this.peek(), "program nested too deeply");
            return false;
        }
        return true;
    }

    frame leave(this: *Parser) {
        this.depth = this.depth - 1;
    }

    frame block(this: *Parser) ret int {
        local open: Tok = this.peek();
        if (!this.expect(TokType.LBrace, "expected '{'")) {
            return -1;
        }
        local b: int = this.ast.add(NodeType.Block, open.line, open.col);
        loop ((this.error == nullptr) && !this.check(TokType.RBrace) && !this.check(TokType.Eof)) {
            local s: int = this.statement();
            if (s >= 0) {
                this.ast.append(b, s);
            }
        }
        this.expect(TokType.RBrace, "expected '}'");
        return b;
    }

    frame semicolon(this: *Parser) {
        this.expect(TokType.Semicolon, "expected ';'");
    }

    frame statement(this: *Parser) ret int {
        if (!this.enter()) {
            return -1;
        }
        local s: int = this.statementInner();
        this.leave();
        return s;
    }

    frame statementInner(this: *Parser) ret int {
        local t: Tok = this.peek();
        if (t.kind == TokType.Let) {
            this.advance();
            local name: Tok = this.peek();
            if (!this.expect(TokType.Ident, "expected a variable name after 'let'")) {
                return -1;
            }
            if (!this.expect(TokType.Assign, "expected '=' in let")) {
                return -1;
            }
            local value: int = this.expression();
            local n: int = this.ast.add(NodeType.Let, t.line, t.col);
            this.ast.at(n).name = this.lex.text(&name);
            this.ast.at(n).a = value;
            this.semicolon();
            return n;
        }
        if (t.kind == TokType.Fn) {
            return this.function();
        }
        if (t.kind == TokType.If) {
            return this.ifStatement();
        }
        if (t.kind == TokType.While) {
            this.advance();
            local cond: int = this.expression();
            local body: int = this.block();
            local n: int = this.ast.add(NodeType.While, t.line, t.col);
            this.ast.at(n).a = cond;
            this.ast.at(n).b = body;
            return n;
        }
        if (t.kind == TokType.For) {
            return this.forStatement();
        }
        if (t.kind == TokType.Return) {
            this.advance();
            local n: int = this.ast.add(NodeType.Return, t.line, t.col);
            if (!this.check(TokType.Semicolon)) {
                this.ast.at(n).a = this.expression();
            }
            this.semicolon();
            return n;
        }
        if ((t.kind == TokType.Break) || (t.kind == TokType.Continue)) {
            this.advance();
            local n: int = this.ast.add(t.kind == TokType.Break ? NodeType.Break : NodeType.Continue, t.line, t.col);
            this.semicolon();
            return n;
        }
        local e: int = this.expression();
        if (e < 0) {
            return -1;
        }
        local op: TokType = this.peek().kind;
        local is_assign: bool = (op == TokType.Assign) || (op == TokType.PlusAssign) || (op == TokType.MinusAssign) || (op == TokType.StarAssign) || (op == TokType.SlashAssign);
        if (is_assign) {
            local op_tok: Tok = this.advance();
            local value: int = this.expression();
            local target: *AstNode = this.ast.at(e);
            local n: int = -1;
            if (target.kind == NodeType.Var) {
                n = this.ast.add(NodeType.Assign, op_tok.line, op_tok.col);
                this.ast.at(n).name = Text.copy(this.ast.at(e).name);
                this.ast.at(n).a = value;
            } else if (target.kind == NodeType.Index) {
                n = this.ast.add(NodeType.IndexAssign, op_tok.line, op_tok.col);
                this.ast.at(n).a = this.ast.at(e).a;
                this.ast.at(n).b = this.ast.at(e).b;
                this.ast.at(n).c = value;
            } else {
                this.failAt(op_tok, "only variables and indexed elements can be assigned");
                return -1;
            }
            this.ast.at(n).op = op;
            this.semicolon();
            return n;
        }
        local n: int = this.ast.add(NodeType.ExprStmt, t.line, t.col);
        this.ast.at(n).a = e;
        this.semicolon();
        return n;
    }

    frame function(this: *Parser) ret int {
        local t: Tok = this.advance();
        local name: Tok = this.peek();
        if (!this.expect(TokType.Ident, "expected a function name")) {
            return -1;
        }
        if (!this.expect(TokType.LParen, "expected '(' after function name")) {
            return -1;
        }
        local n: int = this.ast.add(NodeType.Function, t.line, t.col);
        this.ast.at(n).name = this.lex.text(&name);
        # Parameters are Var nodes chained through `first`.
        local params: int = this.ast.add(NodeType.Block, t.line, t.col);
        if (!this.check(TokType.RParen)) {
            loop {
                local p: Tok = this.peek();
                if (!this.expect(TokType.Ident, "expected a parameter name")) {
                    return -1;
                }
                local v: int = this.ast.add(NodeType.Var, p.line, p.col);
                this.ast.at(v).name = this.lex.text(&p);
                this.ast.append(params, v);
                if (!this.accept(TokType.Comma)) {
                    break;
                }
            }
        }
        if (!this.expect(TokType.RParen, "expected ')' after parameters")) {
            return -1;
        }
        this.ast.at(n).a = params;
        this.ast.at(n).b = this.block();
        return n;
    }

    frame ifStatement(this: *Parser) ret int {
        local t: Tok = this.advance();
        local cond: int = this.expression();
        local then_block: int = this.block();
        local n: int = this.ast.add(NodeType.If, t.line, t.col);
        this.ast.at(n).a = cond;
        this.ast.at(n).b = then_block;
        if (this.check(TokType.Elif)) {
            # elif chains become nested ifs in the else slot.
            this.ast.at(n).c = this.ifStatement();
        } else if (this.accept(TokType.Else)) {
            if (this.check(TokType.If)) {
                this.ast.at(n).c = this.ifStatement();
            } else {
                this.ast.at(n).c = this.block();
            }
        }
        return n;
    }

    frame forStatement(this: *Parser) ret int {
        local t: Tok = this.advance();
        local var: Tok = this.peek();
        if (!this.expect(TokType.Ident, "expected a loop variable")) {
            return -1;
        }
        if (!this.expect(TokType.In, "expected 'in'")) {
            return -1;
        }
        local lo: int = this.expression();
        if (this.accept(TokType.DotDot)) {
            local hi: int = this.expression();
            local n: int = this.ast.add(NodeType.ForRange, t.line, t.col);
            this.ast.at(n).name = this.lex.text(&var);
            this.ast.at(n).a = lo;
            this.ast.at(n).b = hi;
            this.ast.at(n).c = this.block();
            return n;
        }
        local n: int = this.ast.add(NodeType.ForEach, t.line, t.col);
        this.ast.at(n).name = this.lex.text(&var);
        this.ast.at(n).a = lo;
        this.ast.at(n).c = this.block();
        return n;
    }

    frame expression(this: *Parser) ret int {
        if (!this.enter()) {
            return -1;
        }
        local e: int = this.orExpr();
        this.leave();
        return e;
    }

    frame logical(this: *Parser, op: Tok, left: int, right: int) ret int {
        if ((left < 0) || (right < 0)) {
            return -1;
        }
        local n: int = this.ast.add(NodeType.Logical, op.line, op.col);
        this.ast.at(n).op = op.kind;
        this.ast.at(n).a = left;
        this.ast.at(n).b = right;
        return n;
    }

    frame binary(this: *Parser, op: Tok, left: int, right: int) ret int {
        if ((left < 0) || (right < 0)) {
            return -1;
        }
        local n: int = this.ast.add(NodeType.Binary, op.line, op.col);
        this.ast.at(n).op = op.kind;
        this.ast.at(n).a = left;
        this.ast.at(n).b = right;
        return n;
    }

    frame orExpr(this: *Parser) ret int {
        local left: int = this.andExpr();
        loop ((this.error == nullptr) && this.check(TokType.Or)) {
            local op: Tok = this.advance();
            left = this.logical(op, left, this.andExpr());
        }
        return left;
    }

    frame andExpr(this: *Parser) ret int {
        local left: int = this.notExpr();
        loop ((this.error == nullptr) && this.check(TokType.And)) {
            local op: Tok = this.advance();
            left = this.logical(op, left, this.notExpr());
        }
        return left;
    }

    frame notExpr(this: *Parser) ret int {
        if (this.check(TokType.Not)) {
            local op: Tok = this.advance();
            if (!this.enter()) {
                return -1;
            }
            local inner: int = this.notExpr();
            this.leave();
            if (inner < 0) {
                return -1;
            }
            local n: int = this.ast.add(NodeType.Unary, op.line, op.col);
            this.ast.at(n).op = TokType.Not;
            this.ast.at(n).a = inner;
            return n;
        }
        return this.comparison();
    }

    frame isComparison(kind: TokType) ret bool {
        return (kind == TokType.Eq) || (kind == TokType.Ne) || (kind == TokType.Lt) || (kind == TokType.Le) || (kind == TokType.Gt) || (kind == TokType.Ge);
    }

    frame comparison(this: *Parser) ret int {
        local left: int = this.sum();
        if ((this.error == nullptr) && Parser.isComparison(this.peek().kind)) {
            local op: Tok = this.advance();
            left = this.binary(op, left, this.sum());
            if (Parser.isComparison(this.peek().kind)) {
                this.failAt(this.peek(), "comparisons cannot be chained; use 'and'");
                return -1;
            }
        }
        return left;
    }

    frame sum(this: *Parser) ret int {
        local left: int = this.term();
        loop ((this.error == nullptr) && (this.check(TokType.Plus) || this.check(TokType.Minus))) {
            local op: Tok = this.advance();
            left = this.binary(op, left, this.term());
        }
        return left;
    }

    frame term(this: *Parser) ret int {
        local left: int = this.unary();
        loop ((this.error == nullptr) && (this.check(TokType.Star) || this.check(TokType.Slash) || this.check(TokType.Percent))) {
            local op: Tok = this.advance();
            left = this.binary(op, left, this.unary());
        }
        return left;
    }

    frame unary(this: *Parser) ret int {
        if (this.check(TokType.Minus)) {
            local op: Tok = this.advance();
            if (!this.enter()) {
                return -1;
            }
            local inner: int = this.unary();
            this.leave();
            if (inner < 0) {
                return -1;
            }
            local n: int = this.ast.add(NodeType.Unary, op.line, op.col);
            this.ast.at(n).op = TokType.Minus;
            this.ast.at(n).a = inner;
            return n;
        }
        return this.power();
    }

    # Right-associative exponentiation; binds tighter than a unary minus on its
    # left (-2 ** 2 is -4) and accepts one on its right (2 ** -1).
    frame power(this: *Parser) ret int {
        local base: int = this.postfix();
        if ((this.error == nullptr) && this.check(TokType.Power)) {
            local op: Tok = this.advance();
            if (!this.enter()) {
                return -1;
            }
            local exponent: int = this.unary();
            this.leave();
            return this.binary(op, base, exponent);
        }
        return base;
    }

    frame postfix(this: *Parser) ret int {
        local e: int = this.primary();
        loop ((this.error == nullptr) && (e >= 0)) {
            local t: Tok = this.peek();
            if (t.kind == TokType.LParen) {
                this.advance();
                local call: int = this.ast.add(NodeType.Call, t.line, t.col);
                this.ast.at(call).a = e;
                this.arguments(call, TokType.RParen);
                e = call;
            } else if (t.kind == TokType.LBracket) {
                this.advance();
                local idx: int = this.expression();
                this.expect(TokType.RBracket, "expected ']'");
                local n: int = this.ast.add(NodeType.Index, t.line, t.col);
                this.ast.at(n).a = e;
                this.ast.at(n).b = idx;
                e = n;
            } else {
                break;
            }
        }
        return e;
    }

    frame arguments(this: *Parser, node: int, close: TokType) {
        if (this.accept(close)) {
            return;
        }
        loop (this.error == nullptr) {
            local arg: int = this.expression();
            if (arg < 0) {
                return;
            }
            this.ast.append(node, arg);
            if (this.accept(TokType.Comma)) {
                continue;
            }
            this.expect(close, close == TokType.RParen ? "expected ',' or ')'" : "expected ',' or ']'");
            return;
        }
    }

    # Decodes the escapes of a string token into a fresh buffer.
    frame unescape(this: *Parser, t: *Tok) ret string {
        local out: string = cast<string>(malloc(cast<long>(t.len)));
        local j: int = 0;
        local i: int = t.start + 1;
        local end: int = (t.start + t.len) - 1;
        loop (i < end) {
            local c: char = this.lex.src[i];
            if (c == '\\') {
                i = i + 1;
                local e: char = this.lex.src[i];
                if (e == 'n') {
                    c = '\n';
                } else if (e == 't') {
                    c = '\t';
                } else {
                    c = e;
                }
            }
            out[j] = c;
            j = j + 1;
            i = i + 1;
        }
        out[j] = cast<char>(0);
        return out;
    }

    frame primary(this: *Parser) ret int {
        local t: Tok = this.advance();
        if (t.kind == TokType.Number) {
            local n: int = this.ast.add(NodeType.Number, t.line, t.col);
            this.ast.at(n).num = t.num;
            return n;
        }
        if (t.kind == TokType.String) {
            local n: int = this.ast.add(NodeType.String, t.line, t.col);
            this.ast.at(n).name = this.unescape(&t);
            return n;
        }
        if ((t.kind == TokType.True) || (t.kind == TokType.False)) {
            local n: int = this.ast.add(NodeType.Bool, t.line, t.col);
            this.ast.at(n).num = t.kind == TokType.True ? 1.0 : 0.0;
            return n;
        }
        if (t.kind == TokType.Nil) {
            return this.ast.add(NodeType.Nil, t.line, t.col);
        }
        if (t.kind == TokType.Ident) {
            local n: int = this.ast.add(NodeType.Var, t.line, t.col);
            this.ast.at(n).name = this.lex.text(&t);
            return n;
        }
        if (t.kind == TokType.LParen) {
            local inner: int = this.expression();
            this.expect(TokType.RParen, "expected ')'");
            return inner;
        }
        if (t.kind == TokType.LBracket) {
            local n: int = this.ast.add(NodeType.ArrayLit, t.line, t.col);
            this.arguments(n, TokType.RBracket);
            return n;
        }
        this.failAt(t, t.kind == TokType.Eof ? "unexpected end of program" : "expected an expression");
        return -1;
    }
}
