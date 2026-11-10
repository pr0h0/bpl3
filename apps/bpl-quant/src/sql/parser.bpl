# QQL: a small SQL dialect for ad-hoc analytics.
#
#   SELECT expr [AS name], ...
#   FROM table [( 'arg' )]
#   [WHERE expr] [GROUP BY expr, ...] [HAVING expr]
#   [ORDER BY expr [ASC|DESC], ...] [LIMIT n] [OFFSET m]
#
# Expressions: literals (numbers, 'strings', TRUE/FALSE/NULL), columns, *,
# arithmetic (+ - * / %), || concatenation, comparisons (= != <> < <= > >=),
# [NOT] BETWEEN a AND b, [NOT] IN (...), [NOT] LIKE 'pat%', IS [NOT] NULL,
# AND/OR/NOT, CASE WHEN ... THEN ... [ELSE ...] END, scalar functions
# (ABS, ROUND, FLOOR, CEIL, SQRT, LN, EXP, LOWER, UPPER, LENGTH, COALESCE,
# BUCKET) and aggregates (COUNT, SUM, AVG, MIN, MAX, STDDEV, FIRST, LAST,
# VWAP). Keywords are case-insensitive.

import malloc, free, memcpy from "std/c.bpl";
import [Text], [ParsedFloat] from "../core/text.bpl";

export [SqlParser];
export [Select];
export [SqlNode];
export [SqlKind];
export [SqlOp];

enum SqlKind {
    Number,
    String,
    Bool,
    Null,
    Column,
    Star,
    Unary,
    Binary,
    Between,
    InList,
    Like,
    IsNull,
    Case,
    Call,
    Aggregate,
}

enum SqlOp {
    Add,
    Sub,
    Mul,
    Div,
    Mod,
    Concat,
    Eq,
    Ne,
    Lt,
    Le,
    Gt,
    Ge,
    And,
    Or,
    Not,
    Neg,
    None,
}

struct SqlNode {
    kind: SqlKind,
    op: SqlOp,
    num: float,
    text: string,
    a: int,
    b: int,
    c: int,
    first: int,
    next: int,
    count: int,
    negated: bool,
    func: int,
    agg_slot: int,
    column: int,
    pos: int,
}

struct Select {
    items: int[64],
    aliases: string[64],
    item_count: int,
    table: string,
    table_arg: string,
    where: int,
    group_by: int[16],
    group_count: int,
    having: int,
    order_by: int[8],
    order_desc: bool[8],
    order_count: int,
    limit: long,
    offset: long,
    aggregates: int,
    has_star: bool,
}

struct SqlToken {
    kind: int,
    start: int,
    len: int,
    num: float,
}

# Token kinds.
global const T_END: int = 0;
global const T_IDENT: int = 1;
global const T_NUMBER: int = 2;
global const T_STRING: int = 3;
global const T_OP: int = 4;

global sql_functions: string[13] = ["abs", "round", "floor", "ceil", "sqrt", "ln", "exp", "lower", "upper", "length", "coalesce", "bucket", "sign"];
global sql_aggregates: string[9] = ["count", "sum", "avg", "min", "max", "stddev", "first", "last", "vwap"];

struct SqlParser {
    src: string,
    len: int,
    toks: *SqlToken,
    tok_count: int,
    pos: int,
    nodes: *SqlNode,
    node_count: int,
    node_cap: int,
    strings: *string,
    string_count: int,
    string_cap: int,
    sel: Select,
    error: string,
    error_pos: int,
    depth: int,

    frame parse(this: *SqlParser, text: string) ret bool {
        this.src = Text.copy(text);
        this.len = Text.length(text);
        this.toks = cast<*SqlToken>(malloc(cast<long>(this.len + 2) * sizeof(SqlToken)));
        this.tok_count = 0;
        this.pos = 0;
        this.node_cap = 64;
        this.node_count = 0;
        this.nodes = cast<*SqlNode>(malloc(cast<long>(this.node_cap) * sizeof(SqlNode)));
        this.string_cap = 16;
        this.string_count = 0;
        this.strings = cast<*string>(malloc(cast<long>(this.string_cap) * sizeof(string)));
        this.error = nullptr;
        this.error_pos = 0;
        this.depth = 0;
        this.sel.item_count = 0;
        this.sel.table = nullptr;
        this.sel.table_arg = nullptr;
        this.sel.where = -1;
        this.sel.group_count = 0;
        this.sel.having = -1;
        this.sel.order_count = 0;
        this.sel.limit = -1;
        this.sel.offset = 0;
        this.sel.aggregates = 0;
        this.sel.has_star = false;
        if (!this.tokenize()) {
            return false;
        }
        this.select();
        if ((this.error == nullptr) && (this.peek().kind != T_END)) {
            this.fail("unexpected text after the query");
        }
        return this.error == nullptr;
    }

    frame destroy(this: *SqlParser) {
        loop (local i: int = 0; i < this.string_count; i = i + 1) {
            Text.release(this.strings[i]);
        }
        free(cast<*void>(this.strings));
        free(cast<*void>(this.nodes));
        free(cast<*void>(this.toks));
        Text.release(this.src);
    }

    frame fail(this: *SqlParser, message: string) {
        if (this.error == nullptr) {
            this.error = message;
            this.error_pos = (this.tok_count > 0) && (this.pos < this.tok_count) ? this.toks[this.pos].start : this.len;
        }
    }

    frame keep(this: *SqlParser, s: string) ret string {
        if (this.string_count == this.string_cap) {
            local next_cap: int = this.string_cap * 2;
            local next: *string = cast<*string>(malloc(cast<long>(next_cap) * sizeof(string)));
            loop (local i: int = 0; i < this.string_count; i = i + 1) {
                next[i] = this.strings[i];
            }
            free(cast<*void>(this.strings));
            this.strings = next;
            this.string_cap = next_cap;
        }
        this.strings[this.string_count] = s;
        this.string_count = this.string_count + 1;
        return s;
    }

    # ---- Lexer ----

    frame push(this: *SqlParser, kind: int, start: int, len: int, num: float) {
        this.toks[this.tok_count] = SqlToken { kind: kind, start: start, len: len, num: num };
        this.tok_count = this.tok_count + 1;
    }

    frame tokenize(this: *SqlParser) ret bool {
        local s: string = this.src;
        local n: int = this.len;
        local i: int = 0;
        loop (i < n) {
            local c: char = s[i];
            if (Text.isSpace(c)) {
                i = i + 1;
                continue;
            }
            if ((c == '-') && ((i + 1) < n) && (s[i + 1] == '-')) {
                loop ((i < n) && (s[i] != '\n')) {
                    i = i + 1;
                }
                continue;
            }
            local start: int = i;
            if (Text.isDigit(c) || ((c == '.') && ((i + 1) < n) && Text.isDigit(s[i + 1]))) {
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
                    this.error = "invalid number";
                    this.error_pos = start;
                    return false;
                }
                this.push(T_NUMBER, start, i - start, p.value);
                continue;
            }
            if (c == '\'') {
                i = i + 1;
                loop {
                    if (i >= n) {
                        this.error = "unterminated string";
                        this.error_pos = start;
                        return false;
                    }
                    if (s[i] == '\'') {
                        # '' is an escaped quote.
                        if (((i + 1) < n) && (s[i + 1] == '\'')) {
                            i = i + 2;
                            continue;
                        }
                        break;
                    }
                    i = i + 1;
                }
                i = i + 1;
                this.push(T_STRING, start, i - start, 0.0);
                continue;
            }
            if (Text.isIdentStart(c) || (c == '"')) {
                if (c == '"') {
                    i = i + 1;
                    loop ((i < n) && (s[i] != '"')) {
                        i = i + 1;
                    }
                    if (i >= n) {
                        this.error = "unterminated quoted identifier";
                        this.error_pos = start;
                        return false;
                    }
                    i = i + 1;
                    this.push(T_IDENT, start, i - start, 0.0);
                    continue;
                }
                loop ((i < n) && (Text.isAlnum(s[i]) || (s[i] == '_'))) {
                    i = i + 1;
                }
                this.push(T_IDENT, start, i - start, 0.0);
                continue;
            }
            local two: bool = (i + 1) < n;
            if (two && (((c == '<') && ((s[i + 1] == '=') || (s[i + 1] == '>'))) || ((c == '>') && (s[i + 1] == '=')) || ((c == '!') && (s[i + 1] == '=')) || ((c == '|') && (s[i + 1] == '|')))) {
                this.push(T_OP, start, 2, 0.0);
                i = i + 2;
                continue;
            }
            if ((c == '(') || (c == ')') || (c == ',') || (c == '*') || (c == '+') || (c == '-') || (c == '/') || (c == '%') || (c == '=') || (c == '<') || (c == '>') || (c == ';')) {
                this.push(T_OP, start, 1, 0.0);
                i = i + 1;
                continue;
            }
            this.error = "unexpected character";
            this.error_pos = start;
            return false;
        }
        # A trailing semicolon is allowed.
        if ((this.tok_count > 0) && (this.toks[this.tok_count - 1].kind == T_OP) && (this.src[this.toks[this.tok_count - 1].start] == ';')) {
            this.tok_count = this.tok_count - 1;
        }
        this.push(T_END, n, 0, 0.0);
        return true;
    }

    frame peek(this: *SqlParser) ret SqlToken {
        return this.toks[this.pos];
    }

    frame advance(this: *SqlParser) ret SqlToken {
        local t: SqlToken = this.toks[this.pos];
        if (t.kind != T_END) {
            this.pos = this.pos + 1;
        }
        return t;
    }

    frame tokIs(this: *SqlParser, t: SqlToken, word: string) ret bool {
        local n: int = Text.length(word);
        if (t.len != n) {
            return false;
        }
        loop (local i: int = 0; i < n; i = i + 1) {
            if (Text.lower(this.src[t.start + i]) != word[i]) {
                return false;
            }
        }
        return true;
    }

    frame isKeyword(this: *SqlParser, word: string) ret bool {
        local t: SqlToken = this.peek();
        return (t.kind == T_IDENT) && this.tokIs(t, word);
    }

    frame isOp(this: *SqlParser, op: string) ret bool {
        local t: SqlToken = this.peek();
        return (t.kind == T_OP) && this.tokIs(t, op);
    }

    frame acceptKeyword(this: *SqlParser, word: string) ret bool {
        if (this.isKeyword(word)) {
            this.advance();
            return true;
        }
        return false;
    }

    frame expectKeyword(this: *SqlParser, word: string, message: string) ret bool {
        if (this.acceptKeyword(word)) {
            return true;
        }
        this.fail(message);
        return false;
    }

    frame acceptOp(this: *SqlParser, op: string) ret bool {
        if (this.isOp(op)) {
            this.advance();
            return true;
        }
        return false;
    }

    frame expectOp(this: *SqlParser, op: string, message: string) ret bool {
        if (this.acceptOp(op)) {
            return true;
        }
        this.fail(message);
        return false;
    }

    frame reserved(this: *SqlParser, t: SqlToken) ret bool {
        local words: string[24] = ["select", "from", "where", "group", "by", "having", "order", "limit", "offset", "and", "or", "not", "as", "asc", "desc", "between", "in", "like", "is", "null", "case", "when", "then", "end"];
        loop (local i: int = 0; i < 24; i = i + 1) {
            if (this.tokIs(t, words[i])) {
                return true;
            }
        }
        return this.tokIs(t, "else");
    }

    frame identText(this: *SqlParser, t: SqlToken) ret string {
        if (this.src[t.start] == '"') {
            return this.keep(Text.copyN(cast<string>(cast<*char>(this.src) + t.start + 1), t.len - 2));
        }
        local s: string = Text.copyN(cast<string>(cast<*char>(this.src) + t.start), t.len);
        local lower: string = Text.toLowerCopy(s);
        Text.release(s);
        return this.keep(lower);
    }

    frame stringText(this: *SqlParser, t: SqlToken) ret string {
        local out: string = cast<string>(malloc(cast<long>(t.len)));
        local j: int = 0;
        local i: int = t.start + 1;
        local end: int = (t.start + t.len) - 1;
        loop (i < end) {
            out[j] = this.src[i];
            j = j + 1;
            if ((this.src[i] == '\'') && ((i + 1) < end) && (this.src[i + 1] == '\'')) {
                i = i + 1;
            }
            i = i + 1;
        }
        out[j] = cast<char>(0);
        return this.keep(out);
    }

    # ---- AST ----

    frame node(this: *SqlParser, kind: SqlKind) ret int {
        if (this.node_count >= 4096) {
            this.fail("query too large");
            return -1;
        }
        if (this.node_count == this.node_cap) {
            local next_cap: int = this.node_cap * 2;
            local next: *SqlNode = cast<*SqlNode>(malloc(cast<long>(next_cap) * sizeof(SqlNode)));
            memcpy(cast<*void>(next), cast<*void>(this.nodes), cast<long>(this.node_count) * sizeof(SqlNode));
            free(cast<*void>(this.nodes));
            this.nodes = next;
            this.node_cap = next_cap;
        }
        local idx: int = this.node_count;
        this.node_count = this.node_count + 1;
        local start: int = this.pos > 0 ? this.toks[this.pos - 1].start : 0;
        this.nodes[idx] = SqlNode { kind: kind, op: SqlOp.None, num: 0.0, text: nullptr, a: -1, b: -1, c: -1, first: -1, next: -1, count: 0, negated: false, func: -1, agg_slot: -1, column: -1, pos: start };
        return idx;
    }

    frame append(this: *SqlParser, parent: int, child: int) {
        if (this.nodes[parent].first < 0) {
            this.nodes[parent].first = child;
        } else {
            local cur: int = this.nodes[parent].first;
            loop (this.nodes[cur].next >= 0) {
                cur = this.nodes[cur].next;
            }
            this.nodes[cur].next = child;
        }
        this.nodes[parent].count = this.nodes[parent].count + 1;
    }

    frame binary(this: *SqlParser, op: SqlOp, a: int, b: int) ret int {
        if ((a < 0) || (b < 0)) {
            return -1;
        }
        local n: int = this.node(SqlKind.Binary);
        if (n >= 0) {
            this.nodes[n].op = op;
            this.nodes[n].a = a;
            this.nodes[n].b = b;
        }
        return n;
    }

    # ---- Grammar ----

    frame select(this: *SqlParser) {
        if (!this.expectKeyword("select", "query must start with SELECT")) {
            return;
        }
        loop {
            if (this.sel.item_count >= 64) {
                this.fail("too many select items");
                return;
            }
            local e: int = -1;
            if (this.isOp("*")) {
                this.advance();
                e = this.node(SqlKind.Star);
                this.sel.has_star = true;
            } else {
                e = this.expression();
            }
            if (e < 0) {
                return;
            }
            local alias: string = nullptr;
            if (this.acceptKeyword("as")) {
                local t: SqlToken = this.advance();
                if (t.kind != T_IDENT) {
                    this.fail("expected an alias after AS");
                    return;
                }
                alias = this.identText(t);
            } else if ((this.peek().kind == T_IDENT) && !this.reserved(this.peek())) {
                alias = this.identText(this.advance());
            }
            this.sel.items[this.sel.item_count] = e;
            this.sel.aliases[this.sel.item_count] = alias;
            this.sel.item_count = this.sel.item_count + 1;
            if (!this.acceptOp(",")) {
                break;
            }
        }
        if (!this.expectKeyword("from", "expected FROM")) {
            return;
        }
        local table: SqlToken = this.advance();
        if (table.kind != T_IDENT) {
            this.fail("expected a table name");
            return;
        }
        this.sel.table = this.identText(table);
        if (this.acceptOp("(")) {
            local arg: SqlToken = this.advance();
            if (arg.kind != T_STRING) {
                this.fail("table argument must be a string");
                return;
            }
            this.sel.table_arg = this.stringText(arg);
            if (!this.expectOp(")", "expected ')' after the table argument")) {
                return;
            }
        }
        if (this.acceptKeyword("where")) {
            this.sel.where = this.expression();
        }
        if (this.acceptKeyword("group")) {
            if (!this.expectKeyword("by", "expected BY after GROUP")) {
                return;
            }
            loop {
                if (this.sel.group_count >= 16) {
                    this.fail("too many GROUP BY expressions");
                    return;
                }
                this.sel.group_by[this.sel.group_count] = this.expression();
                this.sel.group_count = this.sel.group_count + 1;
                if (!this.acceptOp(",")) {
                    break;
                }
            }
        }
        if (this.acceptKeyword("having")) {
            this.sel.having = this.expression();
        }
        if (this.acceptKeyword("order")) {
            if (!this.expectKeyword("by", "expected BY after ORDER")) {
                return;
            }
            loop {
                if (this.sel.order_count >= 8) {
                    this.fail("too many ORDER BY expressions");
                    return;
                }
                this.sel.order_by[this.sel.order_count] = this.expression();
                local desc: bool = false;
                if (this.acceptKeyword("desc")) {
                    desc = true;
                } else {
                    this.acceptKeyword("asc");
                }
                this.sel.order_desc[this.sel.order_count] = desc;
                this.sel.order_count = this.sel.order_count + 1;
                if (!this.acceptOp(",")) {
                    break;
                }
            }
        }
        if (this.acceptKeyword("limit")) {
            local t: SqlToken = this.advance();
            if ((t.kind != T_NUMBER) || (t.num < 0.0) || (t.num != cast<float>(cast<long>(t.num)))) {
                this.fail("LIMIT needs a non-negative integer");
                return;
            }
            this.sel.limit = cast<long>(t.num);
        }
        if (this.acceptKeyword("offset")) {
            local t: SqlToken = this.advance();
            if ((t.kind != T_NUMBER) || (t.num < 0.0) || (t.num != cast<float>(cast<long>(t.num)))) {
                this.fail("OFFSET needs a non-negative integer");
                return;
            }
            this.sel.offset = cast<long>(t.num);
        }
    }

    frame expression(this: *SqlParser) ret int {
        this.depth = this.depth + 1;
        if (this.depth > 100) {
            this.fail("expression nested too deeply");
            return -1;
        }
        local e: int = this.orExpr();
        this.depth = this.depth - 1;
        return e;
    }

    frame orExpr(this: *SqlParser) ret int {
        local left: int = this.andExpr();
        loop ((this.error == nullptr) && this.acceptKeyword("or")) {
            left = this.binary(SqlOp.Or, left, this.andExpr());
        }
        return left;
    }

    frame andExpr(this: *SqlParser) ret int {
        local left: int = this.notExpr();
        loop ((this.error == nullptr) && this.acceptKeyword("and")) {
            left = this.binary(SqlOp.And, left, this.notExpr());
        }
        return left;
    }

    frame notExpr(this: *SqlParser) ret int {
        if (this.acceptKeyword("not")) {
            local inner: int = this.notExpr();
            if (inner < 0) {
                return -1;
            }
            local n: int = this.node(SqlKind.Unary);
            this.nodes[n].op = SqlOp.Not;
            this.nodes[n].a = inner;
            return n;
        }
        return this.predicate();
    }

    frame comparisonOp(this: *SqlParser) ret SqlOp {
        local t: SqlToken = this.peek();
        if (t.kind != T_OP) {
            return SqlOp.None;
        }
        if (this.tokIs(t, "=")) {
            return SqlOp.Eq;
        }
        if (this.tokIs(t, "!=") || this.tokIs(t, "<>")) {
            return SqlOp.Ne;
        }
        if (this.tokIs(t, "<")) {
            return SqlOp.Lt;
        }
        if (this.tokIs(t, "<=")) {
            return SqlOp.Le;
        }
        if (this.tokIs(t, ">")) {
            return SqlOp.Gt;
        }
        if (this.tokIs(t, ">=")) {
            return SqlOp.Ge;
        }
        return SqlOp.None;
    }

    frame predicate(this: *SqlParser) ret int {
        local left: int = this.additive();
        if ((left < 0) || (this.error != nullptr)) {
            return -1;
        }
        local op: SqlOp = this.comparisonOp();
        if (op != SqlOp.None) {
            this.advance();
            return this.binary(op, left, this.additive());
        }
        if (this.acceptKeyword("is")) {
            local negated: bool = this.acceptKeyword("not");
            if (!this.expectKeyword("null", "expected NULL after IS")) {
                return -1;
            }
            local n: int = this.node(SqlKind.IsNull);
            this.nodes[n].a = left;
            this.nodes[n].negated = negated;
            return n;
        }
        local negated: bool = false;
        if (this.isKeyword("not")) {
            local after: SqlToken = this.toks[this.pos + 1];
            if ((after.kind == T_IDENT) && (this.tokIs(after, "between") || this.tokIs(after, "in") || this.tokIs(after, "like"))) {
                this.advance();
                negated = true;
            }
        }
        if (this.acceptKeyword("between")) {
            local lo: int = this.additive();
            if (!this.expectKeyword("and", "expected AND in BETWEEN")) {
                return -1;
            }
            local hi: int = this.additive();
            local n: int = this.node(SqlKind.Between);
            this.nodes[n].a = left;
            this.nodes[n].b = lo;
            this.nodes[n].c = hi;
            this.nodes[n].negated = negated;
            return n;
        }
        if (this.acceptKeyword("in")) {
            if (!this.expectOp("(", "expected '(' after IN")) {
                return -1;
            }
            local n: int = this.node(SqlKind.InList);
            this.nodes[n].a = left;
            this.nodes[n].negated = negated;
            loop {
                local item: int = this.additive();
                if (item < 0) {
                    return -1;
                }
                this.append(n, item);
                if (!this.acceptOp(",")) {
                    break;
                }
            }
            if (!this.expectOp(")", "expected ')' to close IN")) {
                return -1;
            }
            return n;
        }
        if (this.acceptKeyword("like")) {
            local pattern: int = this.additive();
            local n: int = this.node(SqlKind.Like);
            this.nodes[n].a = left;
            this.nodes[n].b = pattern;
            this.nodes[n].negated = negated;
            return n;
        }
        if (negated) {
            this.fail("expected BETWEEN, IN or LIKE after NOT");
            return -1;
        }
        return left;
    }

    frame additive(this: *SqlParser) ret int {
        local left: int = this.multiplicative();
        loop ((this.error == nullptr) && (left >= 0)) {
            if (this.acceptOp("+")) {
                left = this.binary(SqlOp.Add, left, this.multiplicative());
            } else if (this.acceptOp("-")) {
                left = this.binary(SqlOp.Sub, left, this.multiplicative());
            } else if (this.acceptOp("||")) {
                left = this.binary(SqlOp.Concat, left, this.multiplicative());
            } else {
                break;
            }
        }
        return left;
    }

    frame multiplicative(this: *SqlParser) ret int {
        local left: int = this.unary();
        loop ((this.error == nullptr) && (left >= 0)) {
            if (this.acceptOp("*")) {
                left = this.binary(SqlOp.Mul, left, this.unary());
            } else if (this.acceptOp("/")) {
                left = this.binary(SqlOp.Div, left, this.unary());
            } else if (this.acceptOp("%")) {
                left = this.binary(SqlOp.Mod, left, this.unary());
            } else {
                break;
            }
        }
        return left;
    }

    frame unary(this: *SqlParser) ret int {
        if (this.acceptOp("-")) {
            this.depth = this.depth + 1;
            if (this.depth > 100) {
                this.fail("expression nested too deeply");
                return -1;
            }
            local inner: int = this.unary();
            this.depth = this.depth - 1;
            if (inner < 0) {
                return -1;
            }
            local n: int = this.node(SqlKind.Unary);
            this.nodes[n].op = SqlOp.Neg;
            this.nodes[n].a = inner;
            return n;
        }
        return this.primary();
    }

    frame findName(this: *SqlParser, t: SqlToken, names: *string, count: int) ret int {
        loop (local i: int = 0; i < count; i = i + 1) {
            if (this.tokIs(t, names[i])) {
                return i;
            }
        }
        return -1;
    }

    frame caseExpr(this: *SqlParser) ret int {
        local n: int = this.node(SqlKind.Case);
        # WHEN/THEN pairs are appended as alternating children.
        loop (this.acceptKeyword("when")) {
            local cond: int = this.expression();
            if (!this.expectKeyword("then", "expected THEN")) {
                return -1;
            }
            local value: int = this.expression();
            if ((cond < 0) || (value < 0)) {
                return -1;
            }
            this.append(n, cond);
            this.append(n, value);
        }
        if (this.nodes[n].count == 0) {
            this.fail("CASE needs at least one WHEN");
            return -1;
        }
        if (this.acceptKeyword("else")) {
            this.nodes[n].a = this.expression();
        }
        if (!this.expectKeyword("end", "expected END to close CASE")) {
            return -1;
        }
        return n;
    }

    frame primary(this: *SqlParser) ret int {
        local t: SqlToken = this.advance();
        if (t.kind == T_NUMBER) {
            local n: int = this.node(SqlKind.Number);
            this.nodes[n].num = t.num;
            return n;
        }
        if (t.kind == T_STRING) {
            local n: int = this.node(SqlKind.String);
            this.nodes[n].text = this.stringText(t);
            return n;
        }
        if ((t.kind == T_OP) && this.tokIs(t, "(")) {
            local inner: int = this.expression();
            if (!this.expectOp(")", "expected ')'")) {
                return -1;
            }
            return inner;
        }
        if (t.kind != T_IDENT) {
            this.pos = this.pos > 0 ? this.pos - 1 : 0;
            this.fail(t.kind == T_END ? "unexpected end of query" : "expected an expression");
            return -1;
        }
        if (this.tokIs(t, "true") || this.tokIs(t, "false")) {
            local n: int = this.node(SqlKind.Bool);
            this.nodes[n].num = this.tokIs(t, "true") ? 1.0 : 0.0;
            return n;
        }
        if (this.tokIs(t, "null")) {
            return this.node(SqlKind.Null);
        }
        if (this.tokIs(t, "case")) {
            return this.caseExpr();
        }
        if (this.isOp("(")) {
            this.advance();
            local agg: int = this.findName(t, &sql_aggregates[0], 9);
            if (agg >= 0) {
                local n: int = this.node(SqlKind.Aggregate);
                this.nodes[n].func = agg;
                this.nodes[n].agg_slot = this.sel.aggregates;
                this.sel.aggregates = this.sel.aggregates + 1;
                if (this.isOp("*")) {
                    if (agg != 0) {
                        this.fail("only COUNT accepts *");
                        return -1;
                    }
                    this.advance();
                } else {
                    local arg: int = this.expression();
                    if (arg < 0) {
                        return -1;
                    }
                    this.nodes[n].a = arg;
                    if (agg == 8) {
                        # VWAP(price, volume)
                        if (!this.expectOp(",", "VWAP needs (price, volume)")) {
                            return -1;
                        }
                        this.nodes[n].b = this.expression();
                    }
                }
                if (!this.expectOp(")", "expected ')' after aggregate argument")) {
                    return -1;
                }
                return n;
            }
            local fid: int = this.findName(t, &sql_functions[0], 13);
            if (fid < 0) {
                this.pos = this.pos - 2;
                this.fail("unknown function");
                return -1;
            }
            local n: int = this.node(SqlKind.Call);
            this.nodes[n].func = fid;
            if (!this.isOp(")")) {
                loop {
                    local arg: int = this.expression();
                    if (arg < 0) {
                        return -1;
                    }
                    this.append(n, arg);
                    if (!this.acceptOp(",")) {
                        break;
                    }
                }
            }
            if (!this.expectOp(")", "expected ')' after function arguments")) {
                return -1;
            }
            local argc: int = this.nodes[n].count;
            local ok: bool = fid == 10 ? argc >= 1 : ((fid == 1) || (fid == 11) ? (argc >= 1) && (argc <= 2) : argc == 1);
            if (!ok) {
                this.fail("wrong number of function arguments");
                return -1;
            }
            return n;
        }
        if (this.reserved(t)) {
            this.pos = this.pos - 1;
            this.fail("expected an expression");
            return -1;
        }
        local n: int = this.node(SqlKind.Column);
        this.nodes[n].text = this.identText(t);
        return n;
    }
}
