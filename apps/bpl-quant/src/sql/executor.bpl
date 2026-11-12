# QQL executor.
#
# 1. Resolve column references against the table and validate the shape
#    (non-aggregated select items must be GROUP BY expressions when grouping).
# 2. Filter rows with WHERE.
# 3. Without grouping or aggregates: project each row. Otherwise hash rows
#    into groups by their GROUP BY values and run the aggregate
#    accumulators, then evaluate select items per group and filter HAVING.
# 4. Sort output rows by ORDER BY keys (stable merge sort) and apply
#    OFFSET/LIMIT.
#
# SQL three-valued logic is simplified: NULL compares unequal to everything
# (including NULL) and WHERE/HAVING treat NULL as false.

import malloc, free, memcpy, snprintf from "std/c.bpl";
import [Math] from "std/math.bpl";
import [StringBuilder] from "std/string_builder.bpl";
import [Text] from "../core/text.bpl";
import [JsonWriter] from "../core/json_writer.bpl";
import [SqlParser], [Select], [SqlNode], [SqlKind], [SqlOp] from "./parser.bpl";
import [Table] from "./table.bpl";

export [Executor];
export [SqlValue];
export [SqlType];
export [ResultSet];

enum SqlType {
    Null,
    Num,
    Str,
    Bool,
}

struct SqlValue {
    kind: SqlType,
    num: float,
    str: string,
}

struct Accum {
    count: long,
    sum: float,
    sum_sq: float,
    min: SqlValue,
    max: SqlValue,
    first: SqlValue,
    last: SqlValue,
    weight: float,
    seen: bool,
}

struct Group {
    key: string,
    first_row: int,
    rows: int,
    accums: *Accum,
    next: int,
}

struct ResultSet {
    columns: string[64],
    column_count: int,
    values: *SqlValue,
    rows: int,
    cap: int,
    scanned: int,
    matched: int,
    groups: int,

    frame destroy(this: *ResultSet) {
        if (this.values != nullptr) {
            free(cast<*void>(this.values));
            this.values = nullptr;
        }
    }

    frame at(this: *ResultSet, row: int, col: int) ret SqlValue {
        return this.values[(row * this.column_count) + col];
    }
}

struct Executor {
    p: *SqlParser,
    table: *Table,
    error: string,
    # Strings produced by expressions (lower(), ||, keys) live until destroy().
    owned: *string,
    owned_count: int,
    owned_cap: int,
    group_mode: bool,
    current_group: *Group,
    max_rows: int,

    frame create(this: *Executor, p: *SqlParser, table: *Table) {
        this.p = p;
        this.table = table;
        this.error = nullptr;
        this.owned_cap = 64;
        this.owned_count = 0;
        this.owned = cast<*string>(malloc(cast<long>(this.owned_cap) * sizeof(string)));
        this.group_mode = false;
        this.current_group = nullptr;
        this.max_rows = 100000;
    }

    frame destroy(this: *Executor) {
        loop (local i: int = 0; i < this.owned_count; i = i + 1) {
            Text.release(this.owned[i]);
        }
        free(cast<*void>(this.owned));
    }

    frame keep(this: *Executor, s: string) ret string {
        if (this.owned_count == this.owned_cap) {
            local next_cap: int = this.owned_cap * 2;
            local next: *string = cast<*string>(malloc(cast<long>(next_cap) * sizeof(string)));
            loop (local i: int = 0; i < this.owned_count; i = i + 1) {
                next[i] = this.owned[i];
            }
            free(cast<*void>(this.owned));
            this.owned = next;
            this.owned_cap = next_cap;
        }
        this.owned[this.owned_count] = s;
        this.owned_count = this.owned_count + 1;
        return s;
    }

    frame fail(this: *Executor, message: string) {
        if (this.error == nullptr) {
            this.error = message;
        }
    }

    frame none() ret SqlValue {
        return SqlValue { kind: SqlType.Null, num: 0.0, str: nullptr };
    }

    frame number(x: float) ret SqlValue {
        if (x != x) {
            return Executor.none();
        }
        return SqlValue { kind: SqlType.Num, num: x, str: nullptr };
    }

    frame text(s: string) ret SqlValue {
        if (s == nullptr) {
            return Executor.none();
        }
        return SqlValue { kind: SqlType.Str, num: 0.0, str: s };
    }

    frame boolean(b: bool) ret SqlValue {
        return SqlValue { kind: SqlType.Bool, num: b ? 1.0 : 0.0, str: nullptr };
    }

    frame truthy(v: SqlValue) ret bool {
        if ((v.kind == SqlType.Bool) || (v.kind == SqlType.Num)) {
            return v.num != 0.0;
        }
        return false;
    }

    frame node(this: *Executor, idx: int) ret *SqlNode {
        return this.p.nodes + idx;
    }

    # ---- Resolution ----

    frame resolve(this: *Executor, idx: int) {
        if ((idx < 0) || (this.error != nullptr)) {
            return;
        }
        local n: *SqlNode = this.node(idx);
        if (n.kind == SqlKind.Column) {
            n.column = this.table.find(n.text);
            if (n.column < 0) {
                this.fail("unknown column");
            }
            return;
        }
        this.resolve(n.a);
        this.resolve(n.b);
        this.resolve(n.c);
        local cur: int = n.first;
        loop (cur >= 0) {
            this.resolve(cur);
            cur = this.node(cur).next;
        }
    }

    frame containsAggregate(this: *Executor, idx: int) ret bool {
        if (idx < 0) {
            return false;
        }
        local n: *SqlNode = this.node(idx);
        if (n.kind == SqlKind.Aggregate) {
            return true;
        }
        if (this.containsAggregate(n.a) || this.containsAggregate(n.b) || this.containsAggregate(n.c)) {
            return true;
        }
        local cur: int = n.first;
        loop (cur >= 0) {
            if (this.containsAggregate(cur)) {
                return true;
            }
            cur = this.node(cur).next;
        }
        return false;
    }

    # Structural equality of two expressions (used to match GROUP BY items).
    frame sameExpr(this: *Executor, a: int, b: int) ret bool {
        if ((a < 0) || (b < 0)) {
            return a == b;
        }
        local x: *SqlNode = this.node(a);
        local y: *SqlNode = this.node(b);
        if ((x.kind != y.kind) || (x.op != y.op) || (x.func != y.func) || (x.negated != y.negated)) {
            return false;
        }
        if (x.kind == SqlKind.Column) {
            return x.column == y.column;
        }
        if ((x.kind == SqlKind.Number) || (x.kind == SqlKind.Bool)) {
            return x.num == y.num;
        }
        if (x.kind == SqlKind.String) {
            return Text.equals(x.text, y.text);
        }
        if (!this.sameExpr(x.a, y.a) || !this.sameExpr(x.b, y.b) || !this.sameExpr(x.c, y.c)) {
            return false;
        }
        local ca: int = x.first;
        local cb: int = y.first;
        loop ((ca >= 0) && (cb >= 0)) {
            if (!this.sameExpr(ca, cb)) {
                return false;
            }
            ca = this.node(ca).next;
            cb = this.node(cb).next;
        }
        return ca == cb;
    }

    # In grouped queries, every column outside an aggregate must be grouped.
    frame groupedOnly(this: *Executor, idx: int) ret bool {
        if (idx < 0) {
            return true;
        }
        loop (local g: int = 0; g < this.p.sel.group_count; g = g + 1) {
            if (this.sameExpr(idx, this.p.sel.group_by[g])) {
                return true;
            }
        }
        local n: *SqlNode = this.node(idx);
        if (n.kind == SqlKind.Aggregate) {
            return true;
        }
        if ((n.kind == SqlKind.Column) || (n.kind == SqlKind.Star)) {
            return false;
        }
        if (!this.groupedOnly(n.a) || !this.groupedOnly(n.b) || !this.groupedOnly(n.c)) {
            return false;
        }
        local cur: int = n.first;
        loop (cur >= 0) {
            if (!this.groupedOnly(cur)) {
                return false;
            }
            cur = this.node(cur).next;
        }
        return true;
    }

    # ---- Evaluation ----

    frame columnValue(this: *Executor, col: int, row: int) ret SqlValue {
        if (this.table.numeric[col]) {
            return Executor.number(this.table.nums[col][row]);
        }
        return Executor.text(this.table.texts[col][row]);
    }

    frame compare(a: SqlValue, b: SqlValue) ret int {
        if ((a.kind == SqlType.Str) && (b.kind == SqlType.Str)) {
            local i: int = 0;
            loop {
                if (a.str[i] != b.str[i]) {
                    return a.str[i] < b.str[i] ? -1 : 1;
                }
                if (a.str[i] == cast<char>(0)) {
                    return 0;
                }
                i = i + 1;
            }
        }
        if (a.num < b.num) {
            return -1;
        }
        if (a.num > b.num) {
            return 1;
        }
        return 0;
    }

    frame comparable(a: SqlValue, b: SqlValue) ret bool {
        if ((a.kind == SqlType.Null) || (b.kind == SqlType.Null)) {
            return false;
        }
        local an: bool = (a.kind == SqlType.Num) || (a.kind == SqlType.Bool);
        local bn: bool = (b.kind == SqlType.Num) || (b.kind == SqlType.Bool);
        return (an && bn) || ((a.kind == SqlType.Str) && (b.kind == SqlType.Str));
    }

    # SQL LIKE with % (any run) and _ (one character).
    frame like(s: string, p: string, si: int, pi: int) ret bool {
        loop {
            local pc: char = p[pi];
            if (pc == cast<char>(0)) {
                return s[si] == cast<char>(0);
            }
            if (pc == '%') {
                loop (p[pi] == '%') {
                    pi = pi + 1;
                }
                if (p[pi] == cast<char>(0)) {
                    return true;
                }
                loop (s[si] != cast<char>(0)) {
                    if (Executor.like(s, p, si, pi)) {
                        return true;
                    }
                    si = si + 1;
                }
                return false;
            }
            if (s[si] == cast<char>(0)) {
                return false;
            }
            if ((pc != '_') && (pc != s[si])) {
                return false;
            }
            si = si + 1;
            pi = pi + 1;
        }
        return false;
    }

    frame format(this: *Executor, v: SqlValue) ret string {
        if (v.kind == SqlType.Str) {
            return v.str;
        }
        if (v.kind == SqlType.Null) {
            return "";
        }
        if (v.kind == SqlType.Bool) {
            return v.num != 0.0 ? "true" : "false";
        }
        local buf: char[48];
        snprintf(cast<string>(&buf[0]), 48, "%.12g", v.num);
        return this.keep(Text.copy(cast<string>(&buf[0])));
    }

    frame eval(this: *Executor, idx: int, row: int) ret SqlValue {
        if (this.error != nullptr) {
            return Executor.none();
        }
        local n: *SqlNode = this.node(idx);
        local kind: SqlKind = n.kind;
        if (kind == SqlKind.Number) {
            return Executor.number(n.num);
        }
        if (kind == SqlKind.String) {
            return Executor.text(n.text);
        }
        if (kind == SqlKind.Bool) {
            return Executor.boolean(n.num != 0.0);
        }
        if (kind == SqlKind.Null) {
            return Executor.none();
        }
        if (kind == SqlKind.Column) {
            local r: int = this.group_mode ? this.current_group.first_row : row;
            return this.columnValue(n.column, r);
        }
        if (kind == SqlKind.Star) {
            this.fail("* is only valid as a select item or in COUNT(*)");
            return Executor.none();
        }
        if (kind == SqlKind.Aggregate) {
            if (!this.group_mode) {
                this.fail("aggregate used outside an aggregate query");
                return Executor.none();
            }
            return this.aggregateResult(n, this.current_group.accums + n.agg_slot);
        }
        if (kind == SqlKind.Unary) {
            local v: SqlValue = this.eval(n.a, row);
            if (n.op == SqlOp.Not) {
                if (v.kind == SqlType.Null) {
                    return v;
                }
                return Executor.boolean(!Executor.truthy(v));
            }
            if (v.kind != SqlType.Num) {
                return Executor.none();
            }
            return Executor.number(-v.num);
        }
        if (kind == SqlKind.Binary) {
            return this.binary(n, row);
        }
        if (kind == SqlKind.Between) {
            local v: SqlValue = this.eval(n.a, row);
            local lo: SqlValue = this.eval(n.b, row);
            local hi: SqlValue = this.eval(n.c, row);
            if (!Executor.comparable(v, lo) || !Executor.comparable(v, hi)) {
                return Executor.none();
            }
            local inside: bool = (Executor.compare(v, lo) >= 0) && (Executor.compare(v, hi) <= 0);
            return Executor.boolean(n.negated ? !inside : inside);
        }
        if (kind == SqlKind.InList) {
            local v: SqlValue = this.eval(n.a, row);
            if (v.kind == SqlType.Null) {
                return v;
            }
            local found: bool = false;
            local cur: int = n.first;
            loop ((cur >= 0) && !found) {
                local item: SqlValue = this.eval(cur, row);
                if (Executor.comparable(v, item) && (Executor.compare(v, item) == 0)) {
                    found = true;
                }
                cur = this.node(cur).next;
            }
            return Executor.boolean(n.negated ? !found : found);
        }
        if (kind == SqlKind.Like) {
            local v: SqlValue = this.eval(n.a, row);
            local pat: SqlValue = this.eval(n.b, row);
            if ((v.kind != SqlType.Str) || (pat.kind != SqlType.Str)) {
                return Executor.none();
            }
            local m: bool = Executor.like(v.str, pat.str, 0, 0);
            return Executor.boolean(n.negated ? !m : m);
        }
        if (kind == SqlKind.IsNull) {
            local v: SqlValue = this.eval(n.a, row);
            local isnull: bool = v.kind == SqlType.Null;
            return Executor.boolean(n.negated ? !isnull : isnull);
        }
        if (kind == SqlKind.Case) {
            local cur: int = n.first;
            loop (cur >= 0) {
                local cond: SqlValue = this.eval(cur, row);
                local value_node: int = this.node(cur).next;
                if (Executor.truthy(cond)) {
                    return this.eval(value_node, row);
                }
                cur = this.node(value_node).next;
            }
            if (n.a >= 0) {
                return this.eval(n.a, row);
            }
            return Executor.none();
        }
        return this.call(n, row);
    }

    frame binary(this: *Executor, n: *SqlNode, row: int) ret SqlValue {
        if (n.op == SqlOp.And) {
            local a: SqlValue = this.eval(n.a, row);
            if ((a.kind != SqlType.Null) && !Executor.truthy(a)) {
                return Executor.boolean(false);
            }
            local b: SqlValue = this.eval(n.b, row);
            if ((b.kind != SqlType.Null) && !Executor.truthy(b)) {
                return Executor.boolean(false);
            }
            if ((a.kind == SqlType.Null) || (b.kind == SqlType.Null)) {
                return Executor.none();
            }
            return Executor.boolean(true);
        }
        if (n.op == SqlOp.Or) {
            local a: SqlValue = this.eval(n.a, row);
            if (Executor.truthy(a)) {
                return Executor.boolean(true);
            }
            local b: SqlValue = this.eval(n.b, row);
            if (Executor.truthy(b)) {
                return Executor.boolean(true);
            }
            if ((a.kind == SqlType.Null) || (b.kind == SqlType.Null)) {
                return Executor.none();
            }
            return Executor.boolean(false);
        }
        local a: SqlValue = this.eval(n.a, row);
        local b: SqlValue = this.eval(n.b, row);
        if (n.op == SqlOp.Concat) {
            if ((a.kind == SqlType.Null) || (b.kind == SqlType.Null)) {
                return Executor.none();
            }
            local sb: StringBuilder = StringBuilder.new(32);
            sb.append(this.format(a));
            sb.append(this.format(b));
            local s: string = this.keep(Text.copy(sb.toString()));
            sb.destroy();
            return Executor.text(s);
        }
        local op: SqlOp = n.op;
        local is_cmp: bool = (op == SqlOp.Eq) || (op == SqlOp.Ne) || (op == SqlOp.Lt) || (op == SqlOp.Le) || (op == SqlOp.Gt) || (op == SqlOp.Ge);
        if (is_cmp) {
            if (!Executor.comparable(a, b)) {
                return Executor.none();
            }
            local c: int = Executor.compare(a, b);
            return Executor.boolean(match (op) {
                SqlOp.Eq => c == 0,
                SqlOp.Ne => c != 0,
                SqlOp.Lt => c < 0,
                SqlOp.Le => c <= 0,
                SqlOp.Gt => c > 0,
                _ => c >= 0,
            });
        }
        if ((a.kind != SqlType.Num) || (b.kind != SqlType.Num)) {
            return Executor.none();
        }
        local x: float = a.num;
        local y: float = b.num;
        if (op == SqlOp.Add) {
            return Executor.number(x + y);
        }
        if (op == SqlOp.Sub) {
            return Executor.number(x - y);
        }
        if (op == SqlOp.Mul) {
            return Executor.number(x * y);
        }
        if (y == 0.0) {
            return Executor.none();
        }
        if (op == SqlOp.Div) {
            return Executor.number(x / y);
        }
        return Executor.number(Math.mod(x, y));
    }

    frame call(this: *Executor, n: *SqlNode, row: int) ret SqlValue {
        local first: SqlValue = this.eval(n.first, row);
        local second_idx: int = this.node(n.first).next;
        if (n.func == 10) {
            # COALESCE
            if (first.kind != SqlType.Null) {
                return first;
            }
            local cur: int = second_idx;
            loop (cur >= 0) {
                local v: SqlValue = this.eval(cur, row);
                if (v.kind != SqlType.Null) {
                    return v;
                }
                cur = this.node(cur).next;
            }
            return Executor.none();
        }
        if ((n.func == 7) || (n.func == 8)) {
            if (first.kind != SqlType.Str) {
                return Executor.none();
            }
            return Executor.text(this.keep(n.func == 7 ? Text.toLowerCopy(first.str) : Text.toUpperCopy(first.str)));
        }
        if (n.func == 9) {
            return first.kind == SqlType.Str ? Executor.number(cast<float>(Text.length(first.str))) : Executor.none();
        }
        if (first.kind != SqlType.Num) {
            return Executor.none();
        }
        local x: float = first.num;
        if (n.func == 0) {
            return Executor.number(Math.abs(x));
        }
        if (n.func == 1) {
            local digits: float = 0.0;
            if (second_idx >= 0) {
                local d: SqlValue = this.eval(second_idx, row);
                digits = d.kind == SqlType.Num ? d.num : 0.0;
            }
            local scale: float = Math.pow(10.0, digits);
            return Executor.number(Math.round(x * scale) / scale);
        }
        if (n.func == 2) {
            return Executor.number(Math.floor(x));
        }
        if (n.func == 3) {
            return Executor.number(Math.ceil(x));
        }
        if (n.func == 4) {
            return x >= 0.0 ? Executor.number(Math.sqrt(x)) : Executor.none();
        }
        if (n.func == 5) {
            return x > 0.0 ? Executor.number(Math.log(x)) : Executor.none();
        }
        if (n.func == 6) {
            return Executor.number(Math.exp(x));
        }
        if (n.func == 11) {
            # BUCKET(x, width): floor to a multiple of width (time buckets).
            local width: float = 1.0;
            if (second_idx >= 0) {
                local wv: SqlValue = this.eval(second_idx, row);
                width = (wv.kind == SqlType.Num) && (wv.num > 0.0) ? wv.num : 1.0;
            }
            return Executor.number(Math.floor(x / width) * width);
        }
        return Executor.number(x > 0.0 ? 1.0 : (x < 0.0 ? -1.0 : 0.0));
    }

    # ---- Aggregates ----

    frame resetAccum(a: *Accum) {
        a.count = 0;
        a.sum = 0.0;
        a.sum_sq = 0.0;
        a.min = Executor.none();
        a.max = Executor.none();
        a.first = Executor.none();
        a.last = Executor.none();
        a.weight = 0.0;
        a.seen = false;
    }

    frame accumulate(this: *Executor, n: *SqlNode, a: *Accum, row: int) {
        if (n.a < 0) {
            a.count = a.count + 1;
            return;
        }
        local v: SqlValue = this.eval(n.a, row);
        if (v.kind == SqlType.Null) {
            return;
        }
        a.count = a.count + 1;
        if (!a.seen) {
            a.first = v;
            a.min = v;
            a.max = v;
            a.seen = true;
        } else {
            if (Executor.comparable(v, a.min) && (Executor.compare(v, a.min) < 0)) {
                a.min = v;
            }
            if (Executor.comparable(v, a.max) && (Executor.compare(v, a.max) > 0)) {
                a.max = v;
            }
        }
        a.last = v;
        if ((v.kind == SqlType.Num) || (v.kind == SqlType.Bool)) {
            if (n.func == 8) {
                local w: SqlValue = this.eval(n.b, row);
                if (w.kind == SqlType.Num) {
                    a.sum = a.sum + (v.num * w.num);
                    a.weight = a.weight + w.num;
                }
            } else {
                a.sum = a.sum + v.num;
                a.sum_sq = a.sum_sq + (v.num * v.num);
            }
        }
    }

    frame aggregateResult(this: *Executor, n: *SqlNode, a: *Accum) ret SqlValue {
        local f: int = n.func;
        if (f == 0) {
            return Executor.number(cast<float>(a.count));
        }
        if (a.count == 0) {
            return Executor.none();
        }
        if (f == 1) {
            return Executor.number(a.sum);
        }
        if (f == 2) {
            return Executor.number(a.sum / cast<float>(a.count));
        }
        if (f == 3) {
            return a.min;
        }
        if (f == 4) {
            return a.max;
        }
        if (f == 5) {
            if (a.count < 2) {
                return Executor.none();
            }
            local c: float = cast<float>(a.count);
            local v: float = (a.sum_sq - ((a.sum * a.sum) / c)) / (c - 1.0);
            return Executor.number(v > 0.0 ? Math.sqrt(v) : 0.0);
        }
        if (f == 6) {
            return a.first;
        }
        if (f == 7) {
            return a.last;
        }
        return a.weight != 0.0 ? Executor.number(a.sum / a.weight) : Executor.none();
    }

    # Collects aggregate nodes by slot so groups can update them per row.
    frame collectAggregates(this: *Executor, idx: int, slots: *int) {
        if (idx < 0) {
            return;
        }
        local n: *SqlNode = this.node(idx);
        if (n.kind == SqlKind.Aggregate) {
            slots[n.agg_slot] = idx;
            return;
        }
        this.collectAggregates(n.a, slots);
        this.collectAggregates(n.b, slots);
        this.collectAggregates(n.c, slots);
        local cur: int = n.first;
        loop (cur >= 0) {
            this.collectAggregates(cur, slots);
            cur = this.node(cur).next;
        }
    }

    frame groupKey(this: *Executor, row: int) ret string {
        local sb: StringBuilder = StringBuilder.new(32);
        loop (local g: int = 0; g < this.p.sel.group_count; g = g + 1) {
            local v: SqlValue = this.eval(this.p.sel.group_by[g], row);
            sb.appendChar(cast<char>(1 + cast<int>(v.kind == SqlType.Null ? 0 : 1)));
            sb.append(this.format(v));
            sb.appendChar(cast<char>(31));
        }
        local key: string = Text.copy(sb.toString());
        sb.destroy();
        return key;
    }

    # ---- Driver ----

    frame run(this: *Executor, out: *ResultSet) ret bool {
        local sel: *Select = &this.p.sel;
        out.values = nullptr;
        out.rows = 0;
        out.scanned = this.table.rows;
        out.matched = 0;
        out.groups = 0;
        # Expand * into the table's columns (only valid without grouping).
        local exprs: int[64];
        local count: int = 0;
        loop (local i: int = 0; i < sel.item_count; i = i + 1) {
            local item: int = sel.items[i];
            if (this.node(item).kind == SqlKind.Star) {
                loop (local c: int = 0; (c < this.table.columns) && (count < 64); c = c + 1) {
                    local col: int = this.p.node(SqlKind.Column);
                    this.node(col).text = this.table.names[c];
                    this.node(col).column = c;
                    exprs[count] = col;
                    out.columns[count] = this.table.names[c];
                    count = count + 1;
                }
                continue;
            }
            if (count >= 64) {
                break;
            }
            this.resolve(item);
            exprs[count] = item;
            local alias: string = sel.aliases[i];
            if (alias == nullptr) {
                local nd: *SqlNode = this.node(item);
                alias = nd.kind == SqlKind.Column ? nd.text : this.keep(Executor.columnName(i));
            }
            out.columns[count] = alias;
            count = count + 1;
        }
        out.column_count = count;
        this.resolve(sel.where);
        this.resolve(sel.having);
        loop (local g: int = 0; g < sel.group_count; g = g + 1) {
            this.resolve(sel.group_by[g]);
        }
        loop (local o: int = 0; o < sel.order_count; o = o + 1) {
            # ORDER BY may name a select alias.
            local on: *SqlNode = this.node(sel.order_by[o]);
            if ((on.kind == SqlKind.Column) && (this.table.find(on.text) < 0)) {
                local matched: bool = false;
                loop (local k: int = 0; k < count; k = k + 1) {
                    if (Text.equals(out.columns[k], on.text)) {
                        sel.order_by[o] = exprs[k];
                        matched = true;
                        break;
                    }
                }
                if (!matched) {
                    this.fail("unknown column in ORDER BY");
                }
            } else {
                this.resolve(sel.order_by[o]);
            }
        }
        if (this.error != nullptr) {
            return false;
        }
        loop (local g: int = 0; g < sel.group_count; g = g + 1) {
            if (this.containsAggregate(sel.group_by[g])) {
                this.fail("aggregates are not allowed in GROUP BY");
                return false;
            }
        }
        if ((sel.where >= 0) && this.containsAggregate(sel.where)) {
            this.fail("aggregates are not allowed in WHERE (use HAVING)");
            return false;
        }
        local aggregate_query: bool = (sel.group_count > 0) || (sel.aggregates > 0);
        if (aggregate_query && sel.has_star) {
            this.fail("SELECT * cannot be combined with GROUP BY or aggregates");
            return false;
        }
        if (!aggregate_query && (sel.having >= 0)) {
            this.fail("HAVING needs GROUP BY or aggregates");
            return false;
        }
        if (aggregate_query) {
            loop (local k: int = 0; k < count; k = k + 1) {
                if (!this.groupedOnly(exprs[k])) {
                    this.fail("non-aggregated column must appear in GROUP BY");
                    return false;
                }
            }
        }
        # WHERE.
        local selected: *int = cast<*int>(malloc(cast<long>(this.table.rows + 1) * sizeof(int)));
        local n_selected: int = 0;
        loop (local r: int = 0; (r < this.table.rows) && (this.error == nullptr); r = r + 1) {
            if ((sel.where < 0) || Executor.truthy(this.eval(sel.where, r))) {
                selected[n_selected] = r;
                n_selected = n_selected + 1;
            }
        }
        out.matched = n_selected;
        if (this.error != nullptr) {
            free(cast<*void>(selected));
            return false;
        }
        local sort_keys: *SqlValue = nullptr;
        if (!aggregate_query) {
            out.cap = n_selected < 1 ? 1 : n_selected;
            out.values = cast<*SqlValue>(malloc(cast<long>(out.cap) * cast<long>(count) * sizeof(SqlValue)));
            if (sel.order_count > 0) {
                sort_keys = cast<*SqlValue>(malloc(cast<long>(out.cap) * cast<long>(sel.order_count) * sizeof(SqlValue)));
            }
            loop (local i: int = 0; i < n_selected; i = i + 1) {
                local r: int = selected[i];
                loop (local k: int = 0; k < count; k = k + 1) {
                    out.values[(i * count) + k] = this.eval(exprs[k], r);
                }
                loop (local o: int = 0; o < sel.order_count; o = o + 1) {
                    sort_keys[(i * sel.order_count) + o] = this.eval(sel.order_by[o], r);
                }
            }
            out.rows = n_selected;
        } else {
            this.grouped(selected, n_selected, &exprs[0], count, out, &sort_keys);
        }
        free(cast<*void>(selected));
        if (this.error != nullptr) {
            if (sort_keys != nullptr) {
                free(cast<*void>(sort_keys));
            }
            return false;
        }
        if ((sel.order_count > 0) && (out.rows > 1)) {
            this.sortRows(out, sort_keys, sel.order_count);
        }
        if (sort_keys != nullptr) {
            free(cast<*void>(sort_keys));
        }
        # OFFSET / LIMIT.
        local start: long = sel.offset;
        if (start > cast<long>(out.rows)) {
            start = cast<long>(out.rows);
        }
        local end: long = sel.limit >= 0 ? start + sel.limit : cast<long>(out.rows);
        if (end > cast<long>(out.rows)) {
            end = cast<long>(out.rows);
        }
        if ((end - start) > cast<long>(this.max_rows)) {
            end = start + cast<long>(this.max_rows);
        }
        if (start > 0) {
            memcpy(cast<*void>(out.values), cast<*void>(out.values + (cast<int>(start) * count)), (end - start) * cast<long>(count) * sizeof(SqlValue));
        }
        out.rows = cast<int>(end - start);
        return true;
    }

    frame columnName(i: int) ret string {
        local buf: char[16];
        snprintf(cast<string>(&buf[0]), 16, "col%d", i + 1);
        return Text.copy(cast<string>(&buf[0]));
    }

    frame grouped(this: *Executor, selected: *int, n: int, exprs: *int, count: int, out: *ResultSet, sort_keys_out: **SqlValue) {
        local sel: *Select = &this.p.sel;
        local naggs: int = sel.aggregates;
        local slots: *int = cast<*int>(malloc(cast<long>(naggs + 1) * sizeof(int)));
        loop (local k: int = 0; k <= naggs; k = k + 1) {
            slots[k] = -1;
        }
        loop (local k: int = 0; k < count; k = k + 1) {
            this.collectAggregates(exprs[k], slots);
        }
        this.collectAggregates(sel.having, slots);
        loop (local o: int = 0; o < sel.order_count; o = o + 1) {
            this.collectAggregates(sel.order_by[o], slots);
        }
        # Open hashing of groups by key string.
        local bucket_count: int = 1024;
        local buckets: *int = cast<*int>(malloc(cast<long>(bucket_count) * sizeof(int)));
        loop (local b: int = 0; b < bucket_count; b = b + 1) {
            buckets[b] = -1;
        }
        local group_cap: int = 64;
        local groups: *Group = cast<*Group>(malloc(cast<long>(group_cap) * sizeof(Group)));
        local group_count: int = 0;
        # A query with aggregates but no GROUP BY has exactly one group.
        if (sel.group_count == 0) {
            groups[0] = Group { key: Text.copy(""), first_row: n > 0 ? selected[0] : 0, rows: 0, accums: cast<*Accum>(malloc(cast<long>(naggs + 1) * sizeof(Accum))), next: -1 };
            loop (local k: int = 0; k < naggs; k = k + 1) {
                Executor.resetAccum(groups[0].accums + k);
            }
            group_count = 1;
        }
        loop (local i: int = 0; (i < n) && (this.error == nullptr); i = i + 1) {
            local r: int = selected[i];
            local gi: int = 0;
            if (sel.group_count > 0) {
                local key: string = this.groupKey(r);
                local h: int = cast<int>(Text.fnv1a(key) & cast<u64>(bucket_count - 1));
                gi = buckets[h];
                loop ((gi >= 0) && !Text.equals(groups[gi].key, key)) {
                    gi = groups[gi].next;
                }
                if (gi < 0) {
                    if (group_count == group_cap) {
                        local next_cap: int = group_cap * 2;
                        local next: *Group = cast<*Group>(malloc(cast<long>(next_cap) * sizeof(Group)));
                        loop (local g: int = 0; g < group_count; g = g + 1) {
                            next[g] = groups[g];
                        }
                        free(cast<*void>(groups));
                        groups = next;
                        group_cap = next_cap;
                    }
                    gi = group_count;
                    groups[gi] = Group { key: key, first_row: r, rows: 0, accums: cast<*Accum>(malloc(cast<long>(naggs + 1) * sizeof(Accum))), next: buckets[h] };
                    loop (local k: int = 0; k < naggs; k = k + 1) {
                        Executor.resetAccum(groups[gi].accums + k);
                    }
                    buckets[h] = gi;
                    group_count = group_count + 1;
                } else {
                    Text.release(key);
                }
            }
            groups[gi].rows = groups[gi].rows + 1;
            loop (local k: int = 0; k < naggs; k = k + 1) {
                if (slots[k] >= 0) {
                    this.accumulate(this.node(slots[k]), groups[gi].accums + k, r);
                }
            }
        }
        out.groups = group_count;
        out.cap = group_count < 1 ? 1 : group_count;
        out.values = cast<*SqlValue>(malloc(cast<long>(out.cap) * cast<long>(count) * sizeof(SqlValue)));
        local keys: *SqlValue = nullptr;
        if (sel.order_count > 0) {
            keys = cast<*SqlValue>(malloc(cast<long>(out.cap) * cast<long>(sel.order_count) * sizeof(SqlValue)));
        }
        local rows: int = 0;
        this.group_mode = true;
        loop (local g: int = 0; (g < group_count) && (this.error == nullptr); g = g + 1) {
            this.current_group = groups + g;
            if ((sel.having >= 0) && !Executor.truthy(this.eval(sel.having, 0))) {
                continue;
            }
            loop (local k: int = 0; k < count; k = k + 1) {
                out.values[(rows * count) + k] = this.eval(exprs[k], 0);
            }
            loop (local o: int = 0; o < sel.order_count; o = o + 1) {
                keys[(rows * sel.order_count) + o] = this.eval(sel.order_by[o], 0);
            }
            rows = rows + 1;
        }
        this.group_mode = false;
        out.rows = rows;
        *sort_keys_out = keys;
        # Group keys are kept: output values may borrow strings formatted from them.
        loop (local g: int = 0; g < group_count; g = g + 1) {
            this.keep(groups[g].key);
            free(cast<*void>(groups[g].accums));
        }
        free(cast<*void>(groups));
        free(cast<*void>(buckets));
        free(cast<*void>(slots));
    }

    # Stable merge sort of result rows (and their keys) by the ORDER BY keys.
    frame sortRows(this: *Executor, out: *ResultSet, keys: *SqlValue, nkeys: int) {
        local n: int = out.rows;
        local idx: *int = cast<*int>(malloc(cast<long>(n) * sizeof(int)));
        local tmp: *int = cast<*int>(malloc(cast<long>(n) * sizeof(int)));
        loop (local i: int = 0; i < n; i = i + 1) {
            idx[i] = i;
        }
        local width: int = 1;
        loop (width < n) {
            local left: int = 0;
            loop (left < n) {
                local mid: int = (left + width) < n ? left + width : n;
                local right: int = (left + (2 * width)) < n ? left + (2 * width) : n;
                local a: int = left;
                local b: int = mid;
                local k: int = left;
                loop ((a < mid) && (b < right)) {
                    if (this.rowLess(keys, nkeys, idx[b], idx[a])) {
                        tmp[k] = idx[b];
                        b = b + 1;
                    } else {
                        tmp[k] = idx[a];
                        a = a + 1;
                    }
                    k = k + 1;
                }
                loop (a < mid) {
                    tmp[k] = idx[a];
                    a = a + 1;
                    k = k + 1;
                }
                loop (b < right) {
                    tmp[k] = idx[b];
                    b = b + 1;
                    k = k + 1;
                }
                left = left + (2 * width);
            }
            loop (local i: int = 0; i < n; i = i + 1) {
                idx[i] = tmp[i];
            }
            width = width * 2;
        }
        local cols: int = out.column_count;
        local sorted: *SqlValue = cast<*SqlValue>(malloc(cast<long>(n) * cast<long>(cols) * sizeof(SqlValue)));
        loop (local i: int = 0; i < n; i = i + 1) {
            loop (local c: int = 0; c < cols; c = c + 1) {
                sorted[(i * cols) + c] = out.values[(idx[i] * cols) + c];
            }
        }
        free(cast<*void>(out.values));
        out.values = sorted;
        free(cast<*void>(idx));
        free(cast<*void>(tmp));
    }

    # NULLs sort last in ascending order and first in descending order.
    frame rowLess(this: *Executor, keys: *SqlValue, nkeys: int, a: int, b: int) ret bool {
        loop (local k: int = 0; k < nkeys; k = k + 1) {
            local va: SqlValue = keys[(a * nkeys) + k];
            local vb: SqlValue = keys[(b * nkeys) + k];
            local c: int = 0;
            if ((va.kind == SqlType.Null) || (vb.kind == SqlType.Null)) {
                if (va.kind != vb.kind) {
                    c = va.kind == SqlType.Null ? 1 : -1;
                }
            } else if (Executor.comparable(va, vb)) {
                c = Executor.compare(va, vb);
            }
            if (this.p.sel.order_desc[k]) {
                c = -c;
            }
            if (c != 0) {
                return c < 0;
            }
        }
        return false;
    }

    frame writeValue(w: *JsonWriter, v: SqlValue) {
        if (v.kind == SqlType.Null) {
            w.nil();
        } else if (v.kind == SqlType.Num) {
            w.num(v.num);
        } else if (v.kind == SqlType.Bool) {
            w.boolean(v.num != 0.0);
        } else {
            w.str(v.str);
        }
    }
}
