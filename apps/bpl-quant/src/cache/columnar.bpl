# A small columnar store with zone maps and an LRU query-result cache.
#
# ColumnTable keeps each column contiguously: 64-bit floats, 64-bit
# integers, or dictionary-encoded strings (int codes plus a dictionary).
# Rows are grouped in blocks of BLOCK_ROWS; every numeric column keeps the
# minimum and maximum of each block (a zone map), and string columns keep a
# 64-bit code mask per block. A scan evaluates a conjunction of predicates
# block by block: blocks whose zone map cannot match are skipped, the rest
# are filtered column at a time into a selection vector. Matching rows feed
# grouped aggregates (count, sum, min, max, avg, first, last, vwap).
#
# QueryCache maps a normalised query text plus the table version to the
# rendered JSON result, evicting least recently used entries; appending to
# a table bumps its version, so stale results are never served.

import malloc, free, memcpy from "std/c.bpl";
import [Math] from "std/math.bpl";
import [Text], [ParsedFloat] from "../core/text.bpl";
import [StrIndex], [LongMap] from "../core/hashmap.bpl";
import [StrList], [CharBuf] from "../core/strlist.bpl";
import [ByteBuf] from "../proto/wire.bpl";

export [ColumnTable];
export [ColumnKind];
export [ColPredicate];
export [PredOp];
export [AggKind];
export [ColQuery];
export [ColResult];
export [ScanStats];
export [QueryCache];

global const BLOCK_ROWS: int = 1024;
global const MAX_COLUMNS: int = 16;
global const MAX_PREDICATES: int = 8;
global const MAX_AGGS: int = 8;

enum ColumnKind {
    F64,
    I64,
    Str,
}

enum PredOp {
    Eq,
    Ne,
    Lt,
    Le,
    Gt,
    Ge,
}

enum AggKind {
    Count,
    Sum,
    Min,
    Max,
    Avg,
    First,
    Last,
    Vwap,
}

struct Column {
    name: string,
    kind: ColumnKind,
    f: *float,
    i: *long,
    codes: *int,
    dict: StrIndex,
    # Zone maps (per block), numeric columns as floats.
    zmin: *float,
    zmax: *float,
    zmask: *u64,
}

struct ColPredicate {
    column: int,
    op: PredOp,
    num: float,
    # Dictionary code for string equality (-1 = value not in dictionary).
    code: int,
    is_string: bool,
}

struct ColQuery {
    preds: ColPredicate[8],
    pred_count: int,
    group: int[2],
    group_count: int,
    agg_kind: AggKind[8],
    agg_col: int[8],
    agg_col2: int[8],
    agg_count: int,
    limit: int,
    error: string,
}

struct ScanStats {
    blocks: int,
    pruned: int,
    rows_scanned: long,
    rows_matched: long,
}

# Grouped aggregate state, one row per group.
struct ColResult {
    keys: *long,
    acc: *float,
    acc2: *float,
    counts: *long,
    groups: int,
    cap: int,
    index: LongMap,
    aggs: int,
    stats: ScanStats,

    frame destroy(this: *ColResult) {
        free(cast<*void>(this.keys));
        free(cast<*void>(this.acc));
        free(cast<*void>(this.acc2));
        free(cast<*void>(this.counts));
        this.index.destroy();
        this.groups = 0;
    }

    frame value(this: *ColResult, g: int, a: int) ret float {
        return this.acc[(g * MAX_AGGS) + a];
    }
}

struct ColumnTable {
    name: string,
    columns: *Column,
    column_count: int,
    rows: int,
    cap: int,
    version: long,

    frame init(this: *ColumnTable, name: string) {
        this.name = name;
        this.columns = cast<*Column>(malloc(cast<long>(MAX_COLUMNS) * sizeof(Column)));
        this.column_count = 0;
        this.rows = 0;
        this.cap = 0;
        this.version = 1;
    }

    frame destroy(this: *ColumnTable) {
        loop (local c: int = 0; c < this.column_count; c = c + 1) {
            local col: *Column = this.columns + c;
            if (col.kind == ColumnKind.F64) {
                free(cast<*void>(col.f));
            } else if (col.kind == ColumnKind.I64) {
                free(cast<*void>(col.i));
            } else {
                free(cast<*void>(col.codes));
                col.dict.destroy();
            }
            free(cast<*void>(col.zmin));
            free(cast<*void>(col.zmax));
            free(cast<*void>(col.zmask));
        }
        free(cast<*void>(this.columns));
        this.columns = nullptr;
        this.column_count = 0;
    }

    frame addColumn(this: *ColumnTable, name: string, kind: ColumnKind) ret int {
        if ((this.column_count == MAX_COLUMNS) || (this.rows > 0)) {
            return -1;
        }
        local col: *Column = this.columns + this.column_count;
        col.name = name;
        col.kind = kind;
        col.f = nullptr;
        col.i = nullptr;
        col.codes = nullptr;
        col.zmin = nullptr;
        col.zmax = nullptr;
        col.zmask = nullptr;
        if (kind == ColumnKind.Str) {
            col.dict = StrIndex.new(64);
        }
        this.column_count = this.column_count + 1;
        return this.column_count - 1;
    }

    frame find(this: *ColumnTable, name: string) ret int {
        loop (local c: int = 0; c < this.column_count; c = c + 1) {
            if (Text.equalsIgnoreCase(this.columns[c].name, name)) {
                return c;
            }
        }
        return -1;
    }

    frame blocks(this: *ColumnTable) ret int {
        return ((this.rows + BLOCK_ROWS) - 1) / BLOCK_ROWS;
    }

    frame growTo(this: *ColumnTable, wanted: int) {
        if (wanted <= this.cap) {
            return;
        }
        local next: int = this.cap == 0 ? BLOCK_ROWS : this.cap * 2;
        loop (next < wanted) {
            next = next * 2;
        }
        local old_blocks: int = this.cap / BLOCK_ROWS;
        local new_blocks: int = next / BLOCK_ROWS;
        loop (local c: int = 0; c < this.column_count; c = c + 1) {
            local col: *Column = this.columns + c;
            if (col.kind == ColumnKind.F64) {
                col.f = cast<*float>(ColumnTable.regrow(cast<*void>(col.f), cast<long>(this.rows) * 8, cast<long>(next) * 8));
            } else if (col.kind == ColumnKind.I64) {
                col.i = cast<*long>(ColumnTable.regrow(cast<*void>(col.i), cast<long>(this.rows) * 8, cast<long>(next) * 8));
            } else {
                col.codes = cast<*int>(ColumnTable.regrow(cast<*void>(col.codes), cast<long>(this.rows) * 4, cast<long>(next) * 4));
            }
            col.zmin = cast<*float>(ColumnTable.regrow(cast<*void>(col.zmin), cast<long>(old_blocks) * 8, cast<long>(new_blocks) * 8));
            col.zmax = cast<*float>(ColumnTable.regrow(cast<*void>(col.zmax), cast<long>(old_blocks) * 8, cast<long>(new_blocks) * 8));
            col.zmask = cast<*u64>(ColumnTable.regrow(cast<*void>(col.zmask), cast<long>(old_blocks) * 8, cast<long>(new_blocks) * 8));
        }
        this.cap = next;
    }

    frame regrow(old: *void, used: long, wanted: long) ret *void {
        local p: *void = malloc(wanted);
        if (p == nullptr) {
            throw "column allocation failed";
        }
        if (old != nullptr) {
            if (used > 0) {
                memcpy(p, old, used);
            }
            free(old);
        }
        return p;
    }

    # Starts a new row; set each column with setF/setI/setS, then commit().
    frame beginRow(this: *ColumnTable) ret int {
        this.growTo(this.rows + 1);
        return this.rows;
    }

    frame setF(this: *ColumnTable, row: int, c: int, v: float) {
        this.columns[c].f[row] = v;
    }

    frame setI(this: *ColumnTable, row: int, c: int, v: long) {
        this.columns[c].i[row] = v;
    }

    frame setS(this: *ColumnTable, row: int, c: int, v: string) {
        local col: *Column = this.columns + c;
        col.codes[row] = col.dict.intern(v == nullptr ? "" : v);
    }

    frame commit(this: *ColumnTable) {
        local row: int = this.rows;
        local block: int = row / BLOCK_ROWS;
        local first: bool = (row % BLOCK_ROWS) == 0;
        loop (local c: int = 0; c < this.column_count; c = c + 1) {
            local col: *Column = this.columns + c;
            local v: float = 0.0;
            if (col.kind == ColumnKind.F64) {
                v = col.f[row];
            } else if (col.kind == ColumnKind.I64) {
                v = cast<float>(col.i[row]);
            } else {
                v = cast<float>(col.codes[row]);
                local bit: u64 = cast<u64>(1) << cast<u64>(col.codes[row] & 63);
                col.zmask[block] = first ? bit : col.zmask[block] | bit;
            }
            if (first) {
                col.zmin[block] = v;
                col.zmax[block] = v;
            } else {
                if (v < col.zmin[block]) {
                    col.zmin[block] = v;
                }
                if (v > col.zmax[block]) {
                    col.zmax[block] = v;
                }
            }
        }
        this.rows = row + 1;
        this.version = this.version + 1;
    }

    frame clear(this: *ColumnTable) {
        this.rows = 0;
        this.version = this.version + 1;
    }

    frame numberAt(this: *ColumnTable, c: int, row: int) ret float {
        local col: *Column = this.columns + c;
        if (col.kind == ColumnKind.F64) {
            return col.f[row];
        }
        if (col.kind == ColumnKind.I64) {
            return cast<float>(col.i[row]);
        }
        return cast<float>(col.codes[row]);
    }

    frame stringAt(this: *ColumnTable, c: int, row: int) ret string {
        local col: *Column = this.columns + c;
        if (col.kind != ColumnKind.Str) {
            return nullptr;
        }
        return col.dict.name(col.codes[row]);
    }

    frame columnName(this: *ColumnTable, c: int) ret string {
        return this.columns[c].name;
    }

    frame isString(this: *ColumnTable, c: int) ret bool {
        return this.columns[c].kind == ColumnKind.Str;
    }

    frame dictName(this: *ColumnTable, c: int, code: int) ret string {
        return this.columns[c].dict.name(code);
    }

    # Raw bytes vs. encoded bytes (dictionary codes as bytes when they fit,
    # delta + zigzag varints for integer columns, floats unchanged).
    frame encodedBytes(this: *ColumnTable, raw: *long) ret long {
        local encoded: long = 0;
        *raw = 0;
        local buf: ByteBuf = ByteBuf.new(4096);
        loop (local c: int = 0; c < this.column_count; c = c + 1) {
            local col: *Column = this.columns + c;
            if (col.kind == ColumnKind.F64) {
                *raw = *raw + (cast<long>(this.rows) * 8);
                encoded = encoded + (cast<long>(this.rows) * 8);
            } else if (col.kind == ColumnKind.I64) {
                *raw = *raw + (cast<long>(this.rows) * 8);
                buf.clear();
                local prev: long = 0;
                loop (local r: int = 0; r < this.rows; r = r + 1) {
                    buf.svarint(col.i[r] - prev);
                    prev = col.i[r];
                }
                encoded = encoded + cast<long>(buf.len);
            } else {
                local text: long = 0;
                loop (local r: int = 0; r < this.rows; r = r + 1) {
                    text = text + cast<long>(Text.length(col.dict.name(col.codes[r])) + 1);
                }
                *raw = *raw + text;
                local width: long = col.dict.count <= 256 ? 1 : (col.dict.count <= 65536 ? 2 : 4);
                local dict_bytes: long = 0;
                loop (local k: int = 0; k < col.dict.count; k = k + 1) {
                    dict_bytes = dict_bytes + cast<long>(Text.length(col.dict.name(k)) + 1);
                }
                encoded = encoded + (cast<long>(this.rows) * width) + dict_bytes;
            }
        }
        buf.destroy();
        return encoded;
    }

    # Can block `b` contain a row satisfying `p`?
    frame blockMayMatch(this: *ColumnTable, b: int, p: *ColPredicate) ret bool {
        local col: *Column = this.columns + p.column;
        if (p.is_string) {
            if (p.op == PredOp.Eq) {
                if (p.code < 0) {
                    return false;
                }
                local bit: u64 = cast<u64>(1) << cast<u64>(p.code & 63);
                return (col.zmask[b] & bit) != cast<u64>(0);
            }
            return true;
        }
        local lo: float = col.zmin[b];
        local hi: float = col.zmax[b];
        if (p.op == PredOp.Eq) {
            return (p.num >= lo) && (p.num <= hi);
        }
        if (p.op == PredOp.Ne) {
            return !((lo == hi) && (lo == p.num));
        }
        if (p.op == PredOp.Lt) {
            return lo < p.num;
        }
        if (p.op == PredOp.Le) {
            return lo <= p.num;
        }
        if (p.op == PredOp.Gt) {
            return hi > p.num;
        }
        return hi >= p.num;
    }

    # Filters `sel` (row numbers, `n` of them) by one predicate; returns the
    # surviving count.
    frame filter(this: *ColumnTable, p: *ColPredicate, sel: *int, n: int) ret int {
        local col: *Column = this.columns + p.column;
        local k: int = 0;
        if (p.is_string) {
            local want: bool = p.op == PredOp.Eq;
            loop (local j: int = 0; j < n; j = j + 1) {
                local hit: bool = col.codes[sel[j]] == p.code;
                if (hit == want) {
                    sel[k] = sel[j];
                    k = k + 1;
                }
            }
            return k;
        }
        loop (local j: int = 0; j < n; j = j + 1) {
            local v: float = 0.0;
            if (col.kind == ColumnKind.F64) {
                v = col.f[sel[j]];
            } else if (col.kind == ColumnKind.I64) {
                v = cast<float>(col.i[sel[j]]);
            } else {
                v = cast<float>(col.codes[sel[j]]);
            }
            local hit: bool = false;
            if (p.op == PredOp.Eq) {
                hit = v == p.num;
            } else if (p.op == PredOp.Ne) {
                hit = v != p.num;
            } else if (p.op == PredOp.Lt) {
                hit = v < p.num;
            } else if (p.op == PredOp.Le) {
                hit = v <= p.num;
            } else if (p.op == PredOp.Gt) {
                hit = v > p.num;
            } else {
                hit = v >= p.num;
            }
            if (hit) {
                sel[k] = sel[j];
                k = k + 1;
            }
        }
        return k;
    }

    frame groupKey(this: *ColumnTable, q: *ColQuery, row: int) ret long {
        local key: long = 0;
        loop (local g: int = 0; g < q.group_count; g = g + 1) {
            local c: int = q.group[g];
            local col: *Column = this.columns + c;
            local part: long = 0;
            if (col.kind == ColumnKind.Str) {
                part = cast<long>(col.codes[row]);
            } else if (col.kind == ColumnKind.I64) {
                part = col.i[row];
            } else {
                part = cast<long>(Math.floor(col.f[row]));
            }
            # Two keys of 32 bits each; the first key is the high half.
            key = g == 0 ? part : (key << 32) | (part & 0xFFFFFFFF);
        }
        return key;
    }

    frame newGroup(r: *ColResult, key: long) ret int {
        if (r.groups == r.cap) {
            local next: int = r.cap * 2;
            r.keys = cast<*long>(ColumnTable.regrow(cast<*void>(r.keys), cast<long>(r.groups) * 8, cast<long>(next) * 8));
            r.acc = cast<*float>(ColumnTable.regrow(cast<*void>(r.acc), cast<long>(r.groups * MAX_AGGS) * 8, cast<long>(next * MAX_AGGS) * 8));
            r.acc2 = cast<*float>(ColumnTable.regrow(cast<*void>(r.acc2), cast<long>(r.groups * MAX_AGGS) * 8, cast<long>(next * MAX_AGGS) * 8));
            r.counts = cast<*long>(ColumnTable.regrow(cast<*void>(r.counts), cast<long>(r.groups) * 8, cast<long>(next) * 8));
            r.cap = next;
        }
        local g: int = r.groups;
        r.keys[g] = key;
        r.counts[g] = 0;
        loop (local a: int = 0; a < MAX_AGGS; a = a + 1) {
            r.acc[(g * MAX_AGGS) + a] = 0.0;
            r.acc2[(g * MAX_AGGS) + a] = 0.0;
        }
        r.index.put(key, cast<long>(g));
        r.groups = g + 1;
        return g;
    }

    frame accumulate(this: *ColumnTable, q: *ColQuery, r: *ColResult, g: int, row: int) {
        local first: bool = r.counts[g] == 0;
        r.counts[g] = r.counts[g] + 1;
        loop (local a: int = 0; a < q.agg_count; a = a + 1) {
            local slot: int = (g * MAX_AGGS) + a;
            local kind: AggKind = q.agg_kind[a];
            if (kind == AggKind.Count) {
                r.acc[slot] = r.acc[slot] + 1.0;
                continue;
            }
            local v: float = this.numberAt(q.agg_col[a], row);
            if ((kind == AggKind.Sum) || (kind == AggKind.Avg)) {
                r.acc[slot] = r.acc[slot] + v;
            } else if (kind == AggKind.Min) {
                if (first || (v < r.acc[slot])) {
                    r.acc[slot] = v;
                }
            } else if (kind == AggKind.Max) {
                if (first || (v > r.acc[slot])) {
                    r.acc[slot] = v;
                }
            } else if (kind == AggKind.First) {
                if (first) {
                    r.acc[slot] = v;
                }
            } else if (kind == AggKind.Last) {
                r.acc[slot] = v;
            } else {
                local weight: float = this.numberAt(q.agg_col2[a], row);
                r.acc[slot] = r.acc[slot] + (v * weight);
                r.acc2[slot] = r.acc2[slot] + weight;
            }
        }
    }

    frame run(this: *ColumnTable, q: *ColQuery) ret ColResult {
        local r: ColResult;
        r.cap = 16;
        r.groups = 0;
        r.keys = cast<*long>(malloc(cast<long>(r.cap) * 8));
        r.acc = cast<*float>(malloc(cast<long>(r.cap * MAX_AGGS) * 8));
        r.acc2 = cast<*float>(malloc(cast<long>(r.cap * MAX_AGGS) * 8));
        r.counts = cast<*long>(malloc(cast<long>(r.cap) * 8));
        r.index = LongMap.new(64);
        r.aggs = q.agg_count;
        r.stats = ScanStats { blocks: 0, pruned: 0, rows_scanned: 0, rows_matched: 0 };
        local sel: *int = cast<*int>(malloc(cast<long>(BLOCK_ROWS) * sizeof(int)));
        local nb: int = this.blocks();
        loop (local b: int = 0; b < nb; b = b + 1) {
            r.stats.blocks = r.stats.blocks + 1;
            local skip: bool = false;
            loop (local k: int = 0; (k < q.pred_count) && !skip; k = k + 1) {
                if (!this.blockMayMatch(b, &q.preds[k])) {
                    skip = true;
                }
            }
            if (skip) {
                r.stats.pruned = r.stats.pruned + 1;
                continue;
            }
            local start: int = b * BLOCK_ROWS;
            local end: int = (start + BLOCK_ROWS) < this.rows ? start + BLOCK_ROWS : this.rows;
            local n: int = end - start;
            loop (local j: int = 0; j < n; j = j + 1) {
                sel[j] = start + j;
            }
            r.stats.rows_scanned = r.stats.rows_scanned + cast<long>(n);
            loop (local k: int = 0; (k < q.pred_count) && (n > 0); k = k + 1) {
                n = this.filter(&q.preds[k], sel, n);
            }
            r.stats.rows_matched = r.stats.rows_matched + cast<long>(n);
            loop (local j: int = 0; j < n; j = j + 1) {
                local key: long = this.groupKey(q, sel[j]);
                local found: long = r.index.getOr(key, -1);
                local g: int = found >= 0 ? cast<int>(found) : ColumnTable.newGroup(&r, key);
                this.accumulate(q, &r, g, sel[j]);
            }
        }
        free(cast<*void>(sel));
        # Finalise averages and VWAPs.
        loop (local g: int = 0; g < r.groups; g = g + 1) {
            loop (local a: int = 0; a < q.agg_count; a = a + 1) {
                local slot: int = (g * MAX_AGGS) + a;
                if (q.agg_kind[a] == AggKind.Avg) {
                    r.acc[slot] = r.acc[slot] / cast<float>(r.counts[g]);
                } else if (q.agg_kind[a] == AggKind.Vwap) {
                    r.acc[slot] = r.acc2[slot] != 0.0 ? r.acc[slot] / r.acc2[slot] : 0.0;
                }
            }
        }
        return r;
    }

    # Parses "col op value [and col op value ...]"; ops = != < <= > >=.
    # String values are quoted with single or double quotes.
    frame parseWhere(this: *ColumnTable, text: string, q: *ColQuery) ret bool {
        q.pred_count = 0;
        if (Text.isEmpty(text)) {
            return true;
        }
        local parts: StrList = ColumnTable.splitWord(text, "and");
        local ok: bool = true;
        loop (local i: int = 0; (i < parts.count) && ok; i = i + 1) {
            if (q.pred_count == MAX_PREDICATES) {
                q.error = "at most 8 predicates";
                ok = false;
                break;
            }
            ok = this.parsePredicate(parts.get(i), &q.preds[q.pred_count], q);
            if (ok) {
                q.pred_count = q.pred_count + 1;
            }
        }
        parts.destroy();
        return ok;
    }

    # Splits on a whole word (case-insensitive), trimming the pieces.
    frame splitWord(text: string, word: string) ret StrList {
        local out: StrList = StrList.new(4);
        local n: int = Text.length(text);
        local w: int = Text.length(word);
        local start: int = 0;
        local i: int = 0;
        local quote: char = cast<char>(0);
        loop (i <= n) {
            local at_end: bool = i == n;
            local c: char = at_end ? cast<char>(0) : text[i];
            if (!at_end && (quote != cast<char>(0))) {
                if (c == quote) {
                    quote = cast<char>(0);
                }
                i = i + 1;
                continue;
            }
            if ((c == '\'') || (c == '"')) {
                quote = c;
                i = i + 1;
                continue;
            }
            local is_word: bool = false;
            if (!at_end && ((i + w) <= n) && ((i == 0) || Text.isSpace(text[i - 1])) && (((i + w) == n) || Text.isSpace(text[i + w]))) {
                is_word = true;
                loop (local k: int = 0; k < w; k = k + 1) {
                    if (Text.lower(text[i + k]) != word[k]) {
                        is_word = false;
                    }
                }
            }
            if (at_end || is_word) {
                local a: int = start;
                local b: int = i;
                loop ((a < b) && Text.isSpace(text[a])) {
                    a = a + 1;
                }
                loop ((b > a) && Text.isSpace(text[b - 1])) {
                    b = b - 1;
                }
                out.adopt(Text.copyN(cast<string>(cast<*char>(text) + a), b - a));
                if (at_end) {
                    break;
                }
                i = i + w;
                start = i;
                continue;
            }
            i = i + 1;
        }
        return out;
    }

    frame parsePredicate(this: *ColumnTable, text: string, p: *ColPredicate, q: *ColQuery) ret bool {
        local n: int = Text.length(text);
        local i: int = 0;
        loop ((i < n) && (Text.isAlnum(text[i]) || (text[i] == '_'))) {
            i = i + 1;
        }
        if (i == 0) {
            q.error = "predicate must start with a column name";
            return false;
        }
        local name: string = Text.copyN(text, i);
        p.column = this.find(name);
        Text.release(name);
        if (p.column < 0) {
            q.error = "unknown column in where";
            return false;
        }
        loop ((i < n) && Text.isSpace(text[i])) {
            i = i + 1;
        }
        local c0: char = i < n ? text[i] : cast<char>(0);
        local c1: char = (i + 1) < n ? text[i + 1] : cast<char>(0);
        if ((c0 == '!') && (c1 == '=')) {
            p.op = PredOp.Ne;
            i = i + 2;
        } else if ((c0 == '<') && (c1 == '=')) {
            p.op = PredOp.Le;
            i = i + 2;
        } else if ((c0 == '>') && (c1 == '=')) {
            p.op = PredOp.Ge;
            i = i + 2;
        } else if (c0 == '<') {
            p.op = PredOp.Lt;
            i = i + 1;
        } else if (c0 == '>') {
            p.op = PredOp.Gt;
            i = i + 1;
        } else if (c0 == '=') {
            p.op = PredOp.Eq;
            i = i + 1;
        } else {
            q.error = "expected = != < <= > >=";
            return false;
        }
        loop ((i < n) && Text.isSpace(text[i])) {
            i = i + 1;
        }
        local value: string = cast<string>(cast<*char>(text) + i);
        p.is_string = this.isString(p.column);
        if (p.is_string) {
            local vn: int = Text.length(value);
            if ((vn < 2) || ((value[0] != '\'') && (value[0] != '"')) || (value[vn - 1] != value[0])) {
                q.error = "string comparisons need a quoted value";
                return false;
            }
            if ((p.op != PredOp.Eq) && (p.op != PredOp.Ne)) {
                q.error = "strings support = and != only";
                return false;
            }
            local inner: string = Text.copyN(cast<string>(cast<*char>(value) + 1), vn - 2);
            p.code = this.columns[p.column].dict.find(inner);
            Text.release(inner);
            p.num = 0.0;
            return true;
        }
        local parsed: ParsedFloat = Text.parseFloat(value);
        if (!parsed.ok) {
            q.error = "numeric comparisons need a number";
            return false;
        }
        p.num = parsed.value;
        p.code = -1;
        return true;
    }

    # "sum(qty), avg(price), count(*), vwap(price, qty)".
    frame parseAggs(this: *ColumnTable, text: string, q: *ColQuery) ret bool {
        q.agg_count = 0;
        local src: string = Text.isEmpty(text) ? "count(*)" : text;
        local n: int = Text.length(src);
        local i: int = 0;
        local ok: bool = true;
        loop ((i < n) && ok) {
            loop ((i < n) && (Text.isSpace(src[i]) || (src[i] == ','))) {
                i = i + 1;
            }
            if (i >= n) {
                break;
            }
            local start: int = i;
            loop ((i < n) && Text.isAlpha(src[i])) {
                i = i + 1;
            }
            local fname: string = Text.copyN(cast<string>(cast<*char>(src) + start), i - start);
            if ((i >= n) || (src[i] != '(')) {
                q.error = "aggregates look like sum(column)";
                ok = false;
                Text.release(fname);
                break;
            }
            i = i + 1;
            local arg_start: int = i;
            loop ((i < n) && (src[i] != ')')) {
                i = i + 1;
            }
            if (i >= n) {
                q.error = "missing ) in aggregate";
                ok = false;
                Text.release(fname);
                break;
            }
            local args: string = Text.copyN(cast<string>(cast<*char>(src) + arg_start), i - arg_start);
            i = i + 1;
            if (q.agg_count == MAX_AGGS) {
                q.error = "at most 8 aggregates";
                ok = false;
            } else {
                ok = this.parseAgg(fname, args, q);
            }
            Text.release(fname);
            Text.release(args);
        }
        if (ok && (q.agg_count == 0)) {
            q.error = "no aggregates";
            ok = false;
        }
        return ok;
    }

    frame parseAgg(this: *ColumnTable, fname: string, args: string, q: *ColQuery) ret bool {
        local a: int = q.agg_count;
        local names: string[8] = ["count", "sum", "min", "max", "avg", "first", "last", "vwap"];
        local kinds: AggKind[8] = [AggKind.Count, AggKind.Sum, AggKind.Min, AggKind.Max, AggKind.Avg, AggKind.First, AggKind.Last, AggKind.Vwap];
        local found: int = -1;
        loop (local k: int = 0; k < 8; k = k + 1) {
            if (Text.equalsIgnoreCase(fname, names[k])) {
                found = k;
            }
        }
        if (found < 0) {
            q.error = "unknown aggregate (count, sum, min, max, avg, first, last, vwap)";
            return false;
        }
        q.agg_kind[a] = kinds[found];
        q.agg_col[a] = -1;
        q.agg_col2[a] = -1;
        local pieces: StrList = StrList.split(args, ',', true);
        local ok: bool = true;
        if (kinds[found] == AggKind.Count) {
            ok = true;
        } else {
            local want: int = kinds[found] == AggKind.Vwap ? 2 : 1;
            if (pieces.count != want) {
                q.error = want == 2 ? "vwap takes (price, weight)" : "aggregate takes one column";
                ok = false;
            } else {
                loop (local k: int = 0; (k < want) && ok; k = k + 1) {
                    local trimmed: string = ColumnTable.trim(pieces.get(k));
                    local c: int = this.find(trimmed);
                    Text.release(trimmed);
                    if ((c < 0) || this.isString(c)) {
                        q.error = "aggregate column must be a numeric column";
                        ok = false;
                    } else if (k == 0) {
                        q.agg_col[a] = c;
                    } else {
                        q.agg_col2[a] = c;
                    }
                }
            }
        }
        pieces.destroy();
        if (ok) {
            q.agg_count = a + 1;
        }
        return ok;
    }

    frame trim(s: string) ret string {
        local n: int = Text.length(s);
        local a: int = 0;
        loop ((a < n) && Text.isSpace(s[a])) {
            a = a + 1;
        }
        local b: int = n;
        loop ((b > a) && Text.isSpace(s[b - 1])) {
            b = b - 1;
        }
        return Text.copyN(cast<string>(cast<*char>(s) + a), b - a);
    }

    # "symbol" or "symbol,side" (at most two columns).
    frame parseGroup(this: *ColumnTable, text: string, q: *ColQuery) ret bool {
        q.group_count = 0;
        if (Text.isEmpty(text)) {
            return true;
        }
        local parts: StrList = StrList.split(text, ',', true);
        local ok: bool = parts.count <= 2;
        if (!ok) {
            q.error = "group by at most two columns";
        }
        loop (local i: int = 0; (i < parts.count) && ok; i = i + 1) {
            local name: string = ColumnTable.trim(parts.get(i));
            local c: int = this.find(name);
            Text.release(name);
            if (c < 0) {
                q.error = "unknown group column";
                ok = false;
            } else {
                q.group[q.group_count] = c;
                q.group_count = q.group_count + 1;
            }
        }
        parts.destroy();
        return ok;
    }

    frame parseQuery(this: *ColumnTable, where: string, group: string, aggs: string, q: *ColQuery) ret bool {
        q.error = nullptr;
        q.limit = 1000;
        q.pred_count = 0;
        q.group_count = 0;
        q.agg_count = 0;
        return this.parseWhere(where, q) && this.parseGroup(group, q) && this.parseAggs(aggs, q);
    }

    # Group key part `g` of a result row, as text when the column is a string.
    frame keyPart(this: *ColumnTable, q: *ColQuery, key: long, g: int) ret long {
        if (q.group_count == 1) {
            return key;
        }
        if (g == 0) {
            return key >> 32;
        }
        local low: long = key & 0xFFFFFFFF;
        if (!this.isString(q.group[1]) && ((low & 0x80000000) != 0)) {
            low = low - 0x100000000;
        }
        return low;
    }
}

struct CacheEntry {
    key: u64,
    version: long,
    text: string,
    last_used: long,
    hits: long,
}

struct QueryCache {
    entries: *CacheEntry,
    count: int,
    cap: int,
    clock: long,
    hits: long,
    misses: long,
    evictions: long,
    stale: long,
    bytes: long,

    frame init(this: *QueryCache, capacity: int) {
        this.cap = capacity < 1 ? 1 : capacity;
        this.entries = cast<*CacheEntry>(malloc(cast<long>(this.cap) * sizeof(CacheEntry)));
        this.count = 0;
        this.clock = 0;
        this.hits = 0;
        this.misses = 0;
        this.evictions = 0;
        this.stale = 0;
        this.bytes = 0;
    }

    frame destroy(this: *QueryCache) {
        this.clear();
        free(cast<*void>(this.entries));
        this.entries = nullptr;
    }

    frame clear(this: *QueryCache) {
        loop (local i: int = 0; i < this.count; i = i + 1) {
            Text.release(this.entries[i].text);
        }
        this.count = 0;
        this.bytes = 0;
    }

    # Lower-cased, whitespace-collapsed key so equivalent spellings share
    # an entry.
    frame normalise(text: string) ret u64 {
        local h: u64 = 0xCBF29CE484222325;
        local space: bool = false;
        local i: int = 0;
        loop (text[i] != cast<char>(0)) {
            local c: char = text[i];
            if (Text.isSpace(c)) {
                space = true;
            } else {
                if (space) {
                    h = (h ^ cast<u64>(32)) * cast<u64>(0x100000001B3);
                    space = false;
                }
                h = (h ^ cast<u64>(cast<uchar>(Text.lower(c)))) * cast<u64>(0x100000001B3);
            }
            i = i + 1;
        }
        return h;
    }

    # Cached text for (key, version), or nullptr. A version mismatch drops
    # the entry.
    frame get(this: *QueryCache, key: u64, version: long) ret string {
        this.clock = this.clock + 1;
        loop (local i: int = 0; i < this.count; i = i + 1) {
            local e: *CacheEntry = this.entries + i;
            if (e.key == key) {
                if (e.version != version) {
                    this.stale = this.stale + 1;
                    this.removeAt(i);
                    this.misses = this.misses + 1;
                    return nullptr;
                }
                e.last_used = this.clock;
                e.hits = e.hits + 1;
                this.hits = this.hits + 1;
                return e.text;
            }
        }
        this.misses = this.misses + 1;
        return nullptr;
    }

    frame removeAt(this: *QueryCache, i: int) {
        this.bytes = this.bytes - cast<long>(Text.length(this.entries[i].text));
        Text.release(this.entries[i].text);
        this.entries[i] = this.entries[this.count - 1];
        this.count = this.count - 1;
    }

    frame put(this: *QueryCache, key: u64, version: long, text: string) {
        this.clock = this.clock + 1;
        if (this.count == this.cap) {
            local oldest: int = 0;
            loop (local i: int = 1; i < this.count; i = i + 1) {
                if (this.entries[i].last_used < this.entries[oldest].last_used) {
                    oldest = i;
                }
            }
            this.removeAt(oldest);
            this.evictions = this.evictions + 1;
        }
        this.entries[this.count] = CacheEntry { key: key, version: version, text: Text.copy(text), last_used: this.clock, hits: 0 };
        this.bytes = this.bytes + cast<long>(Text.length(text));
        this.count = this.count + 1;
    }

    frame hitRate(this: *QueryCache) ret float {
        local total: long = this.hits + this.misses;
        return total == 0 ? 0.0 : cast<float>(this.hits) / cast<float>(total);
    }
}
