# A small filter expression language for list endpoints.
#
#   ?filter=side = "buy" and (price >= 100.5 or qty > 1000) and not symbol ~ "X"
#
# Grammar (lowest to highest precedence):
#   or      := and ("or" and)*
#   and     := not ("and" not)*
#   not     := "not" not | compare
#   compare := sum (("=" | "==" | "!=" | "<" | "<=" | ">" | ">=" | "~" | "in") sum)?
#   sum     := product (("+" | "-") product)*
#   product := unary (("*" | "/" | "%") unary)*
#   unary   := "-" unary | primary
#   primary := number | string | true | false | null | field | call | "(" or ")" | "[" list "]"
#
# Field names are resolved against a schema at compile time so evaluation
# only does an integer lookup through the record accessor. `~` is substring
# containment; `in` tests membership in a list literal. Comparing values of
# different kinds is false (never an error), and null equals only null.

import malloc, free, memcpy, strcmp, strncmp from "std/c.bpl";
import [Math] from "std/math.bpl";
import [Text], [ParsedFloat] from "../core/text.bpl";

export [Filter];
export [FValue];
export [FKind];
export [FilterSchema];
export [SortSpec];

enum FKind {
    Null,
    Num,
    Str,
    Bool,
}

struct FValue {
    kind: FKind,
    num: float,
    str: string,

    frame none() ret FValue {
        return FValue { kind: FKind.Null, num: 0.0, str: nullptr };
    }

    frame number(v: float) ret FValue {
        return FValue { kind: FKind.Num, num: v, str: nullptr };
    }

    frame text(s: string) ret FValue {
        if (s == nullptr) {
            return FValue.none();
        }
        return FValue { kind: FKind.Str, num: 0.0, str: s };
    }

    frame boolean(b: bool) ret FValue {
        return FValue { kind: FKind.Bool, num: b ? 1.0 : 0.0, str: nullptr };
    }

    frame truthy(this: *FValue) ret bool {
        return match (this.kind) {
            FKind.Null => false,
            FKind.Num => this.num != 0.0,
            FKind.Str => this.str[0] != cast<char>(0),
            FKind.Bool => this.num != 0.0,
        };
    }
}

enum TokKind {
    End,
    Num,
    Str,
    Ident,
    Op,
    LParen,
    RParen,
    LBracket,
    RBracket,
    Comma,
}

struct Token {
    kind: TokKind,
    start: int,
    len: int,
    num: float,
}

enum NodeKind {
    Literal,
    Field,
    Unary,
    Binary,
    Call,
    List,
}

enum Op {
    Or,
    And,
    Not,
    Eq,
    Ne,
    Lt,
    Le,
    Gt,
    Ge,
    Contains,
    In,
    Add,
    Sub,
    Mul,
    Div,
    Mod,
    Neg,
    None,
}

struct Node {
    kind: NodeKind,
    op: Op,
    value: FValue,
    field: int,
    left: int,
    right: int,
    # Call/list arguments: first child, chained through `next`.
    first: int,
    next: int,
    func: int,
    argc: int,
}

struct FilterSchema {
    names: *string,
    count: int,

    frame new(names: *string, count: int) ret FilterSchema {
        return FilterSchema { names: names, count: count };
    }

    frame find(this: *FilterSchema, name: string, len: int) ret int {
        loop (local i: int = 0; i < this.count; i = i + 1) {
            local n: string = this.names[i];
            if ((Text.length(n) == len) && (strncmp(name, n, cast<long>(len)) == 0)) {
                return i;
            }
        }
        return -1;
    }
}

struct Filter {
    nodes: *Node,
    count: int,
    cap: int,
    root: int,
    toks: *Token,
    tok_count: int,
    tok_pos: int,
    src: string,
    strings: *string,
    string_count: int,
    error: string,
    error_pos: int,
    schema: FilterSchema,
    max_nodes: int,

    frame compile(text: string, schema: FilterSchema) ret Filter {
        local f: Filter;
        f.src = Text.copy(text);
        f.schema = schema;
        f.cap = 32;
        f.count = 0;
        f.nodes = cast<*Node>(malloc(cast<long>(f.cap) * sizeof(Node)));
        f.strings = cast<*string>(malloc(cast<long>(Text.length(text) + 1) * sizeof(string)));
        f.string_count = 0;
        f.error = nullptr;
        f.error_pos = 0;
        f.root = -1;
        f.max_nodes = 512;
        f.toks = cast<*Token>(malloc(cast<long>(Text.length(text) + 2) * sizeof(Token)));
        f.tok_count = 0;
        f.tok_pos = 0;
        if (!f.tokenize()) {
            return f;
        }
        f.root = f.parseOr(0);
        if ((f.error == nullptr) && (f.peek().kind != TokKind.End)) {
            f.failAt("unexpected token", f.peek().start);
        }
        return f;
    }

    frame destroy(this: *Filter) {
        loop (local i: int = 0; i < this.string_count; i = i + 1) {
            Text.release(this.strings[i]);
        }
        free(cast<*void>(this.strings));
        free(cast<*void>(this.nodes));
        free(cast<*void>(this.toks));
        Text.release(this.src);
        this.nodes = nullptr;
    }

    frame ok(this: *Filter) ret bool {
        return (this.error == nullptr) && (this.root >= 0);
    }

    frame failAt(this: *Filter, message: string, pos: int) {
        if (this.error == nullptr) {
            this.error = message;
            this.error_pos = pos;
        }
    }

    # ---- Lexer ----

    frame pushTok(this: *Filter, kind: TokKind, start: int, len: int, num: float) {
        this.toks[this.tok_count] = Token { kind: kind, start: start, len: len, num: num };
        this.tok_count = this.tok_count + 1;
    }

    frame tokenize(this: *Filter) ret bool {
        local s: string = this.src;
        local n: int = Text.length(s);
        local i: int = 0;
        loop (i < n) {
            local c: char = s[i];
            if (Text.isSpace(c)) {
                i = i + 1;
                continue;
            }
            if (Text.isDigit(c) || ((c == '.') && ((i + 1) < n) && Text.isDigit(s[i + 1]))) {
                local start: int = i;
                loop ((i < n) && (Text.isDigit(s[i]) || (s[i] == '.'))) {
                    i = i + 1;
                }
                if ((i < n) && ((s[i] == 'e') || (s[i] == 'E'))) {
                    i = i + 1;
                    if ((i < n) && ((s[i] == '+') || (s[i] == '-'))) {
                        i = i + 1;
                    }
                    loop ((i < n) && Text.isDigit(s[i])) {
                        i = i + 1;
                    }
                }
                local lit: string = Text.copyN(cast<string>(cast<*char>(s) + start), i - start);
                local p: ParsedFloat = Text.parseFloat(lit);
                Text.release(lit);
                if (!p.ok) {
                    this.failAt("invalid number", start);
                    return false;
                }
                this.pushTok(TokKind.Num, start, i - start, p.value);
                continue;
            }
            if ((c == '"') || (c == '\'')) {
                local quote: char = c;
                local start: int = i;
                i = i + 1;
                loop ((i < n) && (s[i] != quote)) {
                    if ((s[i] == '\\') && ((i + 1) < n)) {
                        i = i + 1;
                    }
                    i = i + 1;
                }
                if (i >= n) {
                    this.failAt("unterminated string", start);
                    return false;
                }
                i = i + 1;
                this.pushTok(TokKind.Str, start, i - start, 0.0);
                continue;
            }
            if (Text.isIdentStart(c)) {
                local start: int = i;
                loop ((i < n) && Text.isIdentPart(s[i])) {
                    i = i + 1;
                }
                this.pushTok(TokKind.Ident, start, i - start, 0.0);
                continue;
            }
            if (c == '(') {
                this.pushTok(TokKind.LParen, i, 1, 0.0);
                i = i + 1;
                continue;
            }
            if (c == ')') {
                this.pushTok(TokKind.RParen, i, 1, 0.0);
                i = i + 1;
                continue;
            }
            if (c == '[') {
                this.pushTok(TokKind.LBracket, i, 1, 0.0);
                i = i + 1;
                continue;
            }
            if (c == ']') {
                this.pushTok(TokKind.RBracket, i, 1, 0.0);
                i = i + 1;
                continue;
            }
            if (c == ',') {
                this.pushTok(TokKind.Comma, i, 1, 0.0);
                i = i + 1;
                continue;
            }
            local two: bool = ((i + 1) < n) && (s[i + 1] == '=');
            if (((c == '<') || (c == '>') || (c == '!') || (c == '=')) && two) {
                this.pushTok(TokKind.Op, i, 2, 0.0);
                i = i + 2;
                continue;
            }
            if ((c == '&') && ((i + 1) < n) && (s[i + 1] == '&')) {
                this.pushTok(TokKind.Op, i, 2, 0.0);
                i = i + 2;
                continue;
            }
            if ((c == '|') && ((i + 1) < n) && (s[i + 1] == '|')) {
                this.pushTok(TokKind.Op, i, 2, 0.0);
                i = i + 2;
                continue;
            }
            if ((c == '<') || (c == '>') || (c == '=') || (c == '~') || (c == '+') || (c == '-') || (c == '*') || (c == '/') || (c == '%') || (c == '!')) {
                this.pushTok(TokKind.Op, i, 1, 0.0);
                i = i + 1;
                continue;
            }
            this.failAt("unexpected character", i);
            return false;
        }
        this.pushTok(TokKind.End, n, 0, 0.0);
        return true;
    }

    # ---- Parser ----

    frame peek(this: *Filter) ret Token {
        return this.toks[this.tok_pos];
    }

    frame advance(this: *Filter) ret Token {
        local t: Token = this.toks[this.tok_pos];
        if (t.kind != TokKind.End) {
            this.tok_pos = this.tok_pos + 1;
        }
        return t;
    }

    frame tokIs(this: *Filter, t: Token, text: string) ret bool {
        local n: int = Text.length(text);
        if (t.len != n) {
            return false;
        }
        loop (local i: int = 0; i < n; i = i + 1) {
            if (Text.lower(this.src[t.start + i]) != text[i]) {
                return false;
            }
        }
        return true;
    }

    frame isWord(this: *Filter, word: string) ret bool {
        local t: Token = this.peek();
        return (t.kind == TokKind.Ident) && this.tokIs(t, word);
    }

    frame isOp(this: *Filter, op: string) ret bool {
        local t: Token = this.peek();
        return (t.kind == TokKind.Op) && this.tokIs(t, op);
    }

    frame node(this: *Filter, kind: NodeKind) ret int {
        if (this.count >= this.max_nodes) {
            this.failAt("expression too large", this.peek().start);
            return -1;
        }
        if (this.count == this.cap) {
            local next_cap: int = this.cap * 2;
            local next: *Node = cast<*Node>(malloc(cast<long>(next_cap) * sizeof(Node)));
            memcpy(cast<*void>(next), cast<*void>(this.nodes), cast<long>(this.count) * sizeof(Node));
            free(cast<*void>(this.nodes));
            this.nodes = next;
            this.cap = next_cap;
        }
        local idx: int = this.count;
        this.count = this.count + 1;
        this.nodes[idx] = Node { kind: kind, op: Op.None, value: FValue.none(), field: -1, left: -1, right: -1, first: -1, next: -1, func: -1, argc: 0 };
        return idx;
    }

    frame binary(this: *Filter, op: Op, left: int, right: int) ret int {
        if ((left < 0) || (right < 0)) {
            return -1;
        }
        local n: int = this.node(NodeKind.Binary);
        if (n < 0) {
            return -1;
        }
        this.nodes[n].op = op;
        this.nodes[n].left = left;
        this.nodes[n].right = right;
        return n;
    }

    frame parseOr(this: *Filter, depth: int) ret int {
        if (depth > 64) {
            this.failAt("expression nested too deeply", this.peek().start);
            return -1;
        }
        local left: int = this.parseAnd(depth);
        loop ((this.error == nullptr) && (this.isWord("or") || this.isOp("||"))) {
            this.advance();
            local right: int = this.parseAnd(depth);
            left = this.binary(Op.Or, left, right);
        }
        return left;
    }

    frame parseAnd(this: *Filter, depth: int) ret int {
        local left: int = this.parseNot(depth);
        loop ((this.error == nullptr) && (this.isWord("and") || this.isOp("&&"))) {
            this.advance();
            local right: int = this.parseNot(depth);
            left = this.binary(Op.And, left, right);
        }
        return left;
    }

    frame parseNot(this: *Filter, depth: int) ret int {
        if (this.isWord("not") || this.isOp("!")) {
            this.advance();
            if (depth > 64) {
                this.failAt("expression nested too deeply", this.peek().start);
                return -1;
            }
            local inner: int = this.parseNot(depth + 1);
            if (inner < 0) {
                return -1;
            }
            local n: int = this.node(NodeKind.Unary);
            if (n < 0) {
                return -1;
            }
            this.nodes[n].op = Op.Not;
            this.nodes[n].left = inner;
            return n;
        }
        return this.parseCompare(depth);
    }

    frame compareOp(this: *Filter) ret Op {
        local t: Token = this.peek();
        if ((t.kind == TokKind.Ident) && this.tokIs(t, "in")) {
            return Op.In;
        }
        if (t.kind != TokKind.Op) {
            return Op.None;
        }
        if (this.tokIs(t, "=") || this.tokIs(t, "==")) {
            return Op.Eq;
        }
        if (this.tokIs(t, "!=")) {
            return Op.Ne;
        }
        if (this.tokIs(t, "<")) {
            return Op.Lt;
        }
        if (this.tokIs(t, "<=")) {
            return Op.Le;
        }
        if (this.tokIs(t, ">")) {
            return Op.Gt;
        }
        if (this.tokIs(t, ">=")) {
            return Op.Ge;
        }
        if (this.tokIs(t, "~")) {
            return Op.Contains;
        }
        return Op.None;
    }

    frame parseCompare(this: *Filter, depth: int) ret int {
        local left: int = this.parseSum(depth);
        if (this.error != nullptr) {
            return -1;
        }
        local op: Op = this.compareOp();
        if (op == Op.None) {
            return left;
        }
        this.advance();
        local right: int = this.parseSum(depth);
        if ((op == Op.In) && (right >= 0) && (this.nodes[right].kind != NodeKind.List)) {
            this.failAt("'in' needs a list literal", this.peek().start);
            return -1;
        }
        return this.binary(op, left, right);
    }

    frame parseSum(this: *Filter, depth: int) ret int {
        local left: int = this.parseProduct(depth);
        loop ((this.error == nullptr) && (this.isOp("+") || this.isOp("-"))) {
            local op: Op = this.isOp("+") ? Op.Add : Op.Sub;
            this.advance();
            local right: int = this.parseProduct(depth);
            left = this.binary(op, left, right);
        }
        return left;
    }

    frame parseProduct(this: *Filter, depth: int) ret int {
        local left: int = this.parseUnary(depth);
        loop ((this.error == nullptr) && (this.isOp("*") || this.isOp("/") || this.isOp("%"))) {
            local op: Op = Op.Mul;
            if (this.isOp("/")) {
                op = Op.Div;
            } else if (this.isOp("%")) {
                op = Op.Mod;
            }
            this.advance();
            local right: int = this.parseUnary(depth);
            left = this.binary(op, left, right);
        }
        return left;
    }

    frame parseUnary(this: *Filter, depth: int) ret int {
        if (this.isOp("-")) {
            this.advance();
            if (depth > 64) {
                this.failAt("expression nested too deeply", this.peek().start);
                return -1;
            }
            local inner: int = this.parseUnary(depth + 1);
            if (inner < 0) {
                return -1;
            }
            local n: int = this.node(NodeKind.Unary);
            if (n < 0) {
                return -1;
            }
            this.nodes[n].op = Op.Neg;
            this.nodes[n].left = inner;
            return n;
        }
        return this.parsePrimary(depth);
    }

    frame unquote(this: *Filter, t: Token) ret string {
        local out: string = cast<string>(malloc(cast<long>(t.len)));
        local j: int = 0;
        local i: int = t.start + 1;
        local end: int = (t.start + t.len) - 1;
        loop (i < end) {
            local c: char = this.src[i];
            if ((c == '\\') && ((i + 1) < end)) {
                i = i + 1;
                c = this.src[i];
                if (c == 'n') {
                    c = '\n';
                } else if (c == 't') {
                    c = '\t';
                }
            }
            out[j] = c;
            j = j + 1;
            i = i + 1;
        }
        out[j] = cast<char>(0);
        this.strings[this.string_count] = out;
        this.string_count = this.string_count + 1;
        return out;
    }

    frame functionId(this: *Filter, t: Token) ret int {
        local names: string[8] = ["abs", "min", "max", "lower", "upper", "len", "round", "coalesce"];
        loop (local i: int = 0; i < 8; i = i + 1) {
            if (this.tokIs(t, names[i])) {
                return i;
            }
        }
        return -1;
    }

    frame parseArgs(this: *Filter, n: int, close: TokKind, depth: int) ret bool {
        local last: int = -1;
        if (this.peek().kind == close) {
            this.advance();
            return true;
        }
        loop {
            local arg: int = this.parseOr(depth + 1);
            if (arg < 0) {
                return false;
            }
            if (last < 0) {
                this.nodes[n].first = arg;
            } else {
                this.nodes[last].next = arg;
            }
            last = arg;
            this.nodes[n].argc = this.nodes[n].argc + 1;
            local t: Token = this.advance();
            if (t.kind == TokKind.Comma) {
                continue;
            }
            if (t.kind == close) {
                return true;
            }
            this.failAt("expected ',' or closing bracket", t.start);
            return false;
        }
        return false;
    }

    frame parsePrimary(this: *Filter, depth: int) ret int {
        local t: Token = this.advance();
        if (t.kind == TokKind.Num) {
            local n: int = this.node(NodeKind.Literal);
            if (n >= 0) {
                this.nodes[n].value = FValue.number(t.num);
            }
            return n;
        }
        if (t.kind == TokKind.Str) {
            local n: int = this.node(NodeKind.Literal);
            if (n >= 0) {
                this.nodes[n].value = FValue.text(this.unquote(t));
            }
            return n;
        }
        if (t.kind == TokKind.LParen) {
            local inner: int = this.parseOr(depth + 1);
            local close: Token = this.advance();
            if (close.kind != TokKind.RParen) {
                this.failAt("expected ')'", close.start);
                return -1;
            }
            return inner;
        }
        if (t.kind == TokKind.LBracket) {
            local n: int = this.node(NodeKind.List);
            if ((n < 0) || !this.parseArgs(n, TokKind.RBracket, depth)) {
                return -1;
            }
            return n;
        }
        if (t.kind == TokKind.Ident) {
            if (this.tokIs(t, "true") || this.tokIs(t, "false")) {
                local n: int = this.node(NodeKind.Literal);
                if (n >= 0) {
                    this.nodes[n].value = FValue.boolean(this.tokIs(t, "true"));
                }
                return n;
            }
            if (this.tokIs(t, "null")) {
                return this.node(NodeKind.Literal);
            }
            if (this.peek().kind == TokKind.LParen) {
                local fid: int = this.functionId(t);
                if (fid < 0) {
                    this.failAt("unknown function", t.start);
                    return -1;
                }
                this.advance();
                local n: int = this.node(NodeKind.Call);
                if (n < 0) {
                    return -1;
                }
                this.nodes[n].func = fid;
                if (!this.parseArgs(n, TokKind.RParen, depth)) {
                    return -1;
                }
                local argc: int = this.nodes[n].argc;
                local arity_ok: bool = (fid == 1) || (fid == 2) || (fid == 7) ? argc >= 1 : argc == 1;
                if (!arity_ok) {
                    this.failAt("wrong number of arguments", t.start);
                    return -1;
                }
                return n;
            }
            local field: int = this.schema.find(cast<string>(cast<*char>(this.src) + t.start), t.len);
            if (field < 0) {
                this.failAt("unknown field", t.start);
                return -1;
            }
            local n: int = this.node(NodeKind.Field);
            if (n >= 0) {
                this.nodes[n].field = field;
            }
            return n;
        }
        this.failAt(t.kind == TokKind.End ? "unexpected end of expression" : "unexpected token", t.start);
        return -1;
    }

    # ---- Evaluation ----

    frame compare(a: *FValue, b: *FValue) ret int {
        if (a.kind == FKind.Str) {
            local c: int = strcmp(a.str, b.str);
            return c < 0 ? -1 : (c > 0 ? 1 : 0);
        }
        if (a.num < b.num) {
            return -1;
        }
        if (a.num > b.num) {
            return 1;
        }
        return 0;
    }

    frame comparable(a: *FValue, b: *FValue) ret bool {
        if ((a.kind == FKind.Null) || (b.kind == FKind.Null)) {
            return false;
        }
        if (a.kind == b.kind) {
            return true;
        }
        # Booleans compare with numbers 0/1.
        return ((a.kind == FKind.Bool) && (b.kind == FKind.Num)) || ((a.kind == FKind.Num) && (b.kind == FKind.Bool));
    }

    frame equal(a: *FValue, b: *FValue) ret bool {
        if ((a.kind == FKind.Null) || (b.kind == FKind.Null)) {
            return a.kind == b.kind;
        }
        if (!Filter.comparable(a, b)) {
            return false;
        }
        return Filter.compare(a, b) == 0;
    }

    frame eval(this: *Filter, n: int, get: Lambda<FValue>(int)) ret FValue {
        local node: Node = this.nodes[n];
        if (node.kind == NodeKind.Literal) {
            return node.value;
        }
        if (node.kind == NodeKind.Field) {
            return get(node.field);
        }
        if (node.kind == NodeKind.Unary) {
            local v: FValue = this.eval(node.left, get);
            if (node.op == Op.Not) {
                return FValue.boolean(!v.truthy());
            }
            if (v.kind != FKind.Num) {
                return FValue.none();
            }
            return FValue.number(-v.num);
        }
        if (node.kind == NodeKind.Call) {
            return this.call(node, get);
        }
        if (node.kind == NodeKind.List) {
            return FValue.none();
        }
        if (node.op == Op.And) {
            local l: FValue = this.eval(node.left, get);
            if (!l.truthy()) {
                return FValue.boolean(false);
            }
            local r: FValue = this.eval(node.right, get);
            return FValue.boolean(r.truthy());
        }
        if (node.op == Op.Or) {
            local l: FValue = this.eval(node.left, get);
            if (l.truthy()) {
                return FValue.boolean(true);
            }
            local r: FValue = this.eval(node.right, get);
            return FValue.boolean(r.truthy());
        }
        local a: FValue = this.eval(node.left, get);
        if (node.op == Op.In) {
            local cur: int = this.nodes[node.right].first;
            loop (cur >= 0) {
                local item: FValue = this.eval(cur, get);
                if (Filter.equal(&a, &item)) {
                    return FValue.boolean(true);
                }
                cur = this.nodes[cur].next;
            }
            return FValue.boolean(false);
        }
        local b: FValue = this.eval(node.right, get);
        return match (node.op) {
            Op.Eq => FValue.boolean(Filter.equal(&a, &b)),
            Op.Ne => FValue.boolean(!Filter.equal(&a, &b)),
            Op.Lt => FValue.boolean(Filter.comparable(&a, &b) && (Filter.compare(&a, &b) < 0)),
            Op.Le => FValue.boolean(Filter.comparable(&a, &b) && (Filter.compare(&a, &b) <= 0)),
            Op.Gt => FValue.boolean(Filter.comparable(&a, &b) && (Filter.compare(&a, &b) > 0)),
            Op.Ge => FValue.boolean(Filter.comparable(&a, &b) && (Filter.compare(&a, &b) >= 0)),
            Op.Contains => FValue.boolean((a.kind == FKind.Str) && (b.kind == FKind.Str) && Text.contains(a.str, b.str)),
            _ => Filter.arith(node.op, &a, &b),
        };
    }

    frame arith(op: Op, a: *FValue, b: *FValue) ret FValue {
        if ((a.kind != FKind.Num) || (b.kind != FKind.Num)) {
            return FValue.none();
        }
        if (op == Op.Add) {
            return FValue.number(a.num + b.num);
        }
        if (op == Op.Sub) {
            return FValue.number(a.num - b.num);
        }
        if (op == Op.Mul) {
            return FValue.number(a.num * b.num);
        }
        if (b.num == 0.0) {
            return FValue.none();
        }
        if (op == Op.Div) {
            return FValue.number(a.num / b.num);
        }
        return FValue.number(Math.mod(a.num, b.num));
    }

    frame call(this: *Filter, node: Node, get: Lambda<FValue>(int)) ret FValue {
        local first: FValue = this.eval(node.first, get);
        if (node.func == 0) {
            return first.kind == FKind.Num ? FValue.number(Math.abs(first.num)) : FValue.none();
        }
        if ((node.func == 1) || (node.func == 2)) {
            local best: FValue = first;
            local cur: int = this.nodes[node.first].next;
            loop (cur >= 0) {
                local v: FValue = this.eval(cur, get);
                if (!Filter.comparable(&best, &v)) {
                    return FValue.none();
                }
                local c: int = Filter.compare(&v, &best);
                if (((node.func == 1) && (c < 0)) || ((node.func == 2) && (c > 0))) {
                    best = v;
                }
                cur = this.nodes[cur].next;
            }
            return best;
        }
        if ((node.func == 3) || (node.func == 4)) {
            if (first.kind != FKind.Str) {
                return FValue.none();
            }
            local out: string = node.func == 3 ? Text.toLowerCopy(first.str) : Text.toUpperCopy(first.str);
            # Interned for the filter's lifetime; bounded by evaluation count.
            return FValue.text(this.keep(out));
        }
        if (node.func == 5) {
            return first.kind == FKind.Str ? FValue.number(cast<float>(Text.length(first.str))) : FValue.none();
        }
        if (node.func == 6) {
            return first.kind == FKind.Num ? FValue.number(Math.round(first.num)) : FValue.none();
        }
        # coalesce: first non-null argument.
        if (first.kind != FKind.Null) {
            return first;
        }
        local cur: int = this.nodes[node.first].next;
        loop (cur >= 0) {
            local v: FValue = this.eval(cur, get);
            if (v.kind != FKind.Null) {
                return v;
            }
            cur = this.nodes[cur].next;
        }
        return FValue.none();
    }

    # Temporary strings from lower()/upper(): a small ring so memory stays bounded.
    frame keep(this: *Filter, s: string) ret string {
        local slot: int = this.string_count;
        if (slot >= Text.length(this.src)) {
            Text.release(this.strings[0]);
            loop (local i: int = 1; i < this.string_count; i = i + 1) {
                this.strings[i - 1] = this.strings[i];
            }
            this.string_count = this.string_count - 1;
        }
        this.strings[this.string_count] = s;
        this.string_count = this.string_count + 1;
        return s;
    }

    frame matches(this: *Filter, get: Lambda<FValue>(int)) ret bool {
        if (!this.ok()) {
            return false;
        }
        local v: FValue = this.eval(this.root, get);
        return v.truthy();
    }

    frame evaluate(this: *Filter, get: Lambda<FValue>(int)) ret FValue {
        if (!this.ok()) {
            return FValue.none();
        }
        return this.eval(this.root, get);
    }
}

# `sort=price:desc,qty` -> up to 4 (field, descending) keys.
struct SortSpec {
    fields: int[4],
    descending: bool[4],
    count: int,
    error: string,

    frame parse(text: string, schema: *FilterSchema) ret SortSpec {
        local s: SortSpec;
        s.count = 0;
        s.error = nullptr;
        if (Text.isEmpty(text)) {
            return s;
        }
        local n: int = Text.length(text);
        local i: int = 0;
        loop (i <= n) {
            local start: int = i;
            loop ((i < n) && (text[i] != ',')) {
                i = i + 1;
            }
            local part_len: int = i - start;
            local colon: int = -1;
            loop (local k: int = start; k < i; k = k + 1) {
                if (text[k] == ':') {
                    colon = k;
                }
            }
            local name_len: int = colon >= 0 ? colon - start : part_len;
            local desc: bool = false;
            if (colon >= 0) {
                local dir: string = Text.copyN(cast<string>(cast<*char>(text) + colon + 1), i - colon - 1);
                if (Text.equalsIgnoreCase(dir, "desc")) {
                    desc = true;
                } else if (!Text.equalsIgnoreCase(dir, "asc")) {
                    s.error = "sort direction must be asc or desc";
                }
                Text.release(dir);
            }
            if (s.error != nullptr) {
                return s;
            }
            local f: int = schema.find(cast<string>(cast<*char>(text) + start), name_len);
            if (f < 0) {
                s.error = "unknown sort field";
                return s;
            }
            if (s.count == 4) {
                s.error = "at most 4 sort keys";
                return s;
            }
            s.fields[s.count] = f;
            s.descending[s.count] = desc;
            s.count = s.count + 1;
            i = i + 1;
        }
        return s;
    }

    # Compares two records via their field accessors; returns <0, 0 or >0.
    frame compareRecords(this: *SortSpec, a: Lambda<FValue>(int), b: Lambda<FValue>(int)) ret int {
        loop (local k: int = 0; k < this.count; k = k + 1) {
            local va: FValue = a(this.fields[k]);
            local vb: FValue = b(this.fields[k]);
            local c: int = 0;
            if ((va.kind == FKind.Null) || (vb.kind == FKind.Null)) {
                c = va.kind == vb.kind ? 0 : (va.kind == FKind.Null ? -1 : 1);
            } else if (Filter.comparable(&va, &vb)) {
                c = Filter.compare(&va, &vb);
            }
            if (c != 0) {
                return this.descending[k] ? -c : c;
            }
        }
        return 0;
    }
}
