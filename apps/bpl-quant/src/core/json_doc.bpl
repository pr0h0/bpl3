# JSON document parser for request bodies.
#
# Parses RFC 8259 JSON into a flat node array: each node records its kind,
# value, first child and next sibling, so the whole document is two
# allocations (nodes and a string pool). Depth and size are bounded, strings
# are unescaped (including \u surrogate pairs) into the pool, and numbers are
# validated by the JSON grammar before conversion.

import malloc, free, memcpy from "std/c.bpl";
import [Text] from "./text.bpl";

extern strtod(text: string, end: *string) ret float;

export [JsonDoc];
export [JsonKind];

global const JSON_MAX_DEPTH: int = 64;

enum JsonKind {
    Null,
    Bool,
    Number,
    String,
    Array,
    Object,
}

struct JsonNode {
    kind: JsonKind,
    number: float,
    boolean: bool,
    # Offsets into the string pool (-1 = none).
    text: int,
    key: int,
    first_child: int,
    last_child: int,
    next: int,
    count: int,
}

struct JsonDoc {
    nodes: *JsonNode,
    node_count: int,
    node_cap: int,
    pool: *char,
    pool_len: int,
    pool_cap: int,
    src: string,
    len: int,
    pos: int,
    error: string,
    error_pos: int,

    frame parse(text: string) ret JsonDoc {
        local d: JsonDoc;
        d.src = text;
        d.len = Text.length(text);
        d.pos = 0;
        d.error = nullptr;
        d.error_pos = 0;
        d.node_cap = 32;
        d.node_count = 0;
        d.nodes = cast<*JsonNode>(malloc(cast<long>(d.node_cap) * sizeof(JsonNode)));
        d.pool_cap = d.len + 16;
        d.pool_len = 0;
        d.pool = cast<*char>(malloc(cast<long>(d.pool_cap)));
        if (text == nullptr) {
            d.fail("empty body");
            return d;
        }
        d.skipWs();
        local root: int = d.value(0);
        if ((root >= 0) && (d.error == nullptr)) {
            d.skipWs();
            if (d.pos != d.len) {
                d.fail("trailing characters after JSON value");
            }
        }
        return d;
    }

    frame destroy(this: *JsonDoc) {
        if (this.nodes != nullptr) {
            free(cast<*void>(this.nodes));
            this.nodes = nullptr;
        }
        if (this.pool != nullptr) {
            free(cast<*void>(this.pool));
            this.pool = nullptr;
        }
    }

    frame ok(this: *JsonDoc) ret bool {
        return (this.error == nullptr) && (this.node_count > 0);
    }

    frame fail(this: *JsonDoc, message: string) {
        if (this.error == nullptr) {
            this.error = message;
            this.error_pos = this.pos;
        }
    }

    frame peek(this: *JsonDoc) ret char {
        if (this.pos >= this.len) {
            return cast<char>(0);
        }
        return this.src[this.pos];
    }

    frame skipWs(this: *JsonDoc) {
        loop (this.pos < this.len) {
            local c: char = this.src[this.pos];
            if ((c == ' ') || (c == '\t') || (c == '\n') || (c == '\r')) {
                this.pos = this.pos + 1;
            } else {
                break;
            }
        }
    }

    frame newNode(this: *JsonDoc, kind: JsonKind) ret int {
        if (this.node_count == this.node_cap) {
            local next_cap: int = this.node_cap * 2;
            local next: *JsonNode = cast<*JsonNode>(malloc(cast<long>(next_cap) * sizeof(JsonNode)));
            memcpy(cast<*void>(next), cast<*void>(this.nodes), cast<long>(this.node_count) * sizeof(JsonNode));
            free(cast<*void>(this.nodes));
            this.nodes = next;
            this.node_cap = next_cap;
        }
        local idx: int = this.node_count;
        this.node_count = this.node_count + 1;
        this.nodes[idx] = JsonNode { kind: kind, number: 0.0, boolean: false, text: -1, key: -1, first_child: -1, last_child: -1, next: -1, count: 0 };
        return idx;
    }

    frame poolPut(this: *JsonDoc, c: char) {
        if ((this.pool_len + 1) >= this.pool_cap) {
            local next_cap: int = this.pool_cap * 2;
            local next: *char = cast<*char>(malloc(cast<long>(next_cap)));
            memcpy(cast<*void>(next), cast<*void>(this.pool), cast<long>(this.pool_len));
            free(cast<*void>(this.pool));
            this.pool = next;
            this.pool_cap = next_cap;
        }
        this.pool[this.pool_len] = c;
        this.pool_len = this.pool_len + 1;
    }

    frame putUtf8(this: *JsonDoc, cp: int) {
        if (cp < 0x80) {
            this.poolPut(cast<char>(cp));
        } else if (cp < 0x800) {
            this.poolPut(cast<char>(0xC0 | (cp >> 6)));
            this.poolPut(cast<char>(0x80 | (cp & 0x3F)));
        } else if (cp < 0x10000) {
            this.poolPut(cast<char>(0xE0 | (cp >> 12)));
            this.poolPut(cast<char>(0x80 | ((cp >> 6) & 0x3F)));
            this.poolPut(cast<char>(0x80 | (cp & 0x3F)));
        } else {
            this.poolPut(cast<char>(0xF0 | (cp >> 18)));
            this.poolPut(cast<char>(0x80 | ((cp >> 12) & 0x3F)));
            this.poolPut(cast<char>(0x80 | ((cp >> 6) & 0x3F)));
            this.poolPut(cast<char>(0x80 | (cp & 0x3F)));
        }
    }

    frame hexDigit(c: char) ret int {
        if ((c >= '0') && (c <= '9')) {
            return cast<int>(c - '0');
        }
        if ((c >= 'a') && (c <= 'f')) {
            return cast<int>(c - 'a') + 10;
        }
        if ((c >= 'A') && (c <= 'F')) {
            return cast<int>(c - 'A') + 10;
        }
        return -1;
    }

    frame hex4(this: *JsonDoc) ret int {
        if ((this.pos + 4) > this.len) {
            return -1;
        }
        local v: int = 0;
        loop (local i: int = 0; i < 4; i = i + 1) {
            local d: int = JsonDoc.hexDigit(this.src[this.pos + i]);
            if (d < 0) {
                return -1;
            }
            v = (v * 16) + d;
        }
        this.pos = this.pos + 4;
        return v;
    }

    # Parses a string at pos (which holds the opening quote); returns its pool offset.
    frame string(this: *JsonDoc) ret int {
        this.pos = this.pos + 1;
        local start: int = this.pool_len;
        loop {
            if (this.pos >= this.len) {
                this.fail("unterminated string");
                return -1;
            }
            local c: char = this.src[this.pos];
            if (c == '"') {
                this.pos = this.pos + 1;
                this.poolPut(cast<char>(0));
                return start;
            }
            if ((c >= cast<char>(0)) && (c < cast<char>(32))) {
                this.fail("control character in string");
                return -1;
            }
            if (c == '\\') {
                this.pos = this.pos + 1;
                local e: char = this.peek();
                this.pos = this.pos + 1;
                if (e == '"') {
                    this.poolPut('"');
                } else if (e == '\\') {
                    this.poolPut('\\');
                } else if (e == '/') {
                    this.poolPut('/');
                } else if (e == 'b') {
                    this.poolPut(cast<char>(8));
                } else if (e == 'f') {
                    this.poolPut(cast<char>(12));
                } else if (e == 'n') {
                    this.poolPut('\n');
                } else if (e == 'r') {
                    this.poolPut('\r');
                } else if (e == 't') {
                    this.poolPut('\t');
                } else if (e == 'u') {
                    local cp: int = this.hex4();
                    if (cp < 0) {
                        this.fail("invalid unicode escape");
                        return -1;
                    }
                    if ((cp >= 0xD800) && (cp <= 0xDBFF)) {
                        if ((this.peek() == '\\') && ((this.pos + 1) < this.len) && (this.src[this.pos + 1] == 'u')) {
                            this.pos = this.pos + 2;
                            local lo: int = this.hex4();
                            if ((lo >= 0xDC00) && (lo <= 0xDFFF)) {
                                cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00);
                            } else {
                                cp = 0xFFFD;
                            }
                        } else {
                            cp = 0xFFFD;
                        }
                    } else if ((cp >= 0xDC00) && (cp <= 0xDFFF)) {
                        cp = 0xFFFD;
                    }
                    if (cp == 0) {
                        this.fail("NUL in string");
                        return -1;
                    }
                    this.putUtf8(cp);
                } else {
                    this.fail("invalid escape");
                    return -1;
                }
                continue;
            }
            this.poolPut(c);
            this.pos = this.pos + 1;
        }
        return -1;
    }

    frame number(this: *JsonDoc) ret int {
        local start: int = this.pos;
        if (this.peek() == '-') {
            this.pos = this.pos + 1;
        }
        if (this.peek() == '0') {
            this.pos = this.pos + 1;
        } else if ((this.peek() >= '1') && (this.peek() <= '9')) {
            loop (Text.isDigit(this.peek())) {
                this.pos = this.pos + 1;
            }
        } else {
            this.fail("invalid number");
            return -1;
        }
        if (this.peek() == '.') {
            this.pos = this.pos + 1;
            if (!Text.isDigit(this.peek())) {
                this.fail("invalid fraction");
                return -1;
            }
            loop (Text.isDigit(this.peek())) {
                this.pos = this.pos + 1;
            }
        }
        if ((this.peek() == 'e') || (this.peek() == 'E')) {
            this.pos = this.pos + 1;
            if ((this.peek() == '+') || (this.peek() == '-')) {
                this.pos = this.pos + 1;
            }
            if (!Text.isDigit(this.peek())) {
                this.fail("invalid exponent");
                return -1;
            }
            loop (Text.isDigit(this.peek())) {
                this.pos = this.pos + 1;
            }
        }
        local n: int = this.newNode(JsonKind.Number);
        local tmp: string = Text.copyN(cast<string>(cast<*char>(this.src) + start), this.pos - start);
        local end: string = nullptr;
        this.nodes[n].number = strtod(tmp, &end);
        Text.release(tmp);
        return n;
    }

    frame literal(this: *JsonDoc, word: string) ret bool {
        local n: int = Text.length(word);
        if ((this.pos + n) > this.len) {
            return false;
        }
        loop (local i: int = 0; i < n; i = i + 1) {
            if (this.src[this.pos + i] != word[i]) {
                return false;
            }
        }
        this.pos = this.pos + n;
        return true;
    }

    frame appendChild(this: *JsonDoc, parent: int, child: int) {
        if (this.nodes[parent].last_child < 0) {
            this.nodes[parent].first_child = child;
        } else {
            this.nodes[this.nodes[parent].last_child].next = child;
        }
        this.nodes[parent].last_child = child;
        this.nodes[parent].count = this.nodes[parent].count + 1;
    }

    frame value(this: *JsonDoc, depth: int) ret int {
        if (depth > JSON_MAX_DEPTH) {
            this.fail("nesting too deep");
            return -1;
        }
        this.skipWs();
        local c: char = this.peek();
        if (c == '{') {
            return this.object(depth);
        }
        if (c == '[') {
            return this.array(depth);
        }
        if (c == '"') {
            local off: int = this.string();
            if (off < 0) {
                return -1;
            }
            local n: int = this.newNode(JsonKind.String);
            this.nodes[n].text = off;
            return n;
        }
        if ((c == '-') || Text.isDigit(c)) {
            return this.number();
        }
        if (this.literal("true")) {
            local n: int = this.newNode(JsonKind.Bool);
            this.nodes[n].boolean = true;
            return n;
        }
        if (this.literal("false")) {
            return this.newNode(JsonKind.Bool);
        }
        if (this.literal("null")) {
            return this.newNode(JsonKind.Null);
        }
        this.fail(c == cast<char>(0) ? "unexpected end of input" : "unexpected character");
        return -1;
    }

    frame array(this: *JsonDoc, depth: int) ret int {
        this.pos = this.pos + 1;
        local node: int = this.newNode(JsonKind.Array);
        this.skipWs();
        if (this.peek() == ']') {
            this.pos = this.pos + 1;
            return node;
        }
        loop {
            local child: int = this.value(depth + 1);
            if (child < 0) {
                return -1;
            }
            this.appendChild(node, child);
            this.skipWs();
            local c: char = this.peek();
            if (c == ',') {
                this.pos = this.pos + 1;
                continue;
            }
            if (c == ']') {
                this.pos = this.pos + 1;
                return node;
            }
            this.fail("expected ',' or ']'");
            return -1;
        }
        return node;
    }

    frame object(this: *JsonDoc, depth: int) ret int {
        this.pos = this.pos + 1;
        local node: int = this.newNode(JsonKind.Object);
        this.skipWs();
        if (this.peek() == '}') {
            this.pos = this.pos + 1;
            return node;
        }
        loop {
            this.skipWs();
            if (this.peek() != '"') {
                this.fail("expected object key");
                return -1;
            }
            local key: int = this.string();
            if (key < 0) {
                return -1;
            }
            this.skipWs();
            if (this.peek() != ':') {
                this.fail("expected ':'");
                return -1;
            }
            this.pos = this.pos + 1;
            local child: int = this.value(depth + 1);
            if (child < 0) {
                return -1;
            }
            this.nodes[child].key = key;
            this.appendChild(node, child);
            this.skipWs();
            local c: char = this.peek();
            if (c == ',') {
                this.pos = this.pos + 1;
                continue;
            }
            if (c == '}') {
                this.pos = this.pos + 1;
                return node;
            }
            this.fail("expected ',' or '}'");
            return -1;
        }
        return node;
    }

    # ---- Accessors (node -1 means missing) ----

    frame root(this: *JsonDoc) ret int {
        return this.ok() ? 0 : -1;
    }

    frame kind(this: *JsonDoc, node: int) ret JsonKind {
        if (node < 0) {
            return JsonKind.Null;
        }
        return this.nodes[node].kind;
    }

    frame isKind(this: *JsonDoc, node: int, k: JsonKind) ret bool {
        return (node >= 0) && (this.nodes[node].kind == k);
    }

    frame poolString(this: *JsonDoc, off: int) ret string {
        if (off < 0) {
            return nullptr;
        }
        return cast<string>(this.pool + off);
    }

    # Last value for `key` in an object (later duplicates win).
    frame get(this: *JsonDoc, node: int, key: string) ret int {
        if (!this.isKind(node, JsonKind.Object)) {
            return -1;
        }
        local found: int = -1;
        local cur: int = this.nodes[node].first_child;
        loop (cur >= 0) {
            if (Text.equals(this.poolString(this.nodes[cur].key), key)) {
                found = cur;
            }
            cur = this.nodes[cur].next;
        }
        return found;
    }

    frame has(this: *JsonDoc, node: int, key: string) ret bool {
        return this.get(node, key) >= 0;
    }

    frame length(this: *JsonDoc, node: int) ret int {
        if (node < 0) {
            return 0;
        }
        return this.nodes[node].count;
    }

    frame child(this: *JsonDoc, node: int, index: int) ret int {
        if (node < 0) {
            return -1;
        }
        local cur: int = this.nodes[node].first_child;
        local i: int = 0;
        loop ((cur >= 0) && (i < index)) {
            cur = this.nodes[cur].next;
            i = i + 1;
        }
        return cur;
    }

    frame first(this: *JsonDoc, node: int) ret int {
        if (node < 0) {
            return -1;
        }
        return this.nodes[node].first_child;
    }

    frame next(this: *JsonDoc, node: int) ret int {
        if (node < 0) {
            return -1;
        }
        return this.nodes[node].next;
    }

    frame keyOf(this: *JsonDoc, node: int) ret string {
        if (node < 0) {
            return nullptr;
        }
        return this.poolString(this.nodes[node].key);
    }

    frame str(this: *JsonDoc, node: int) ret string {
        if (!this.isKind(node, JsonKind.String)) {
            return nullptr;
        }
        return this.poolString(this.nodes[node].text);
    }

    frame num(this: *JsonDoc, node: int, fallback: float) ret float {
        if (!this.isKind(node, JsonKind.Number)) {
            return fallback;
        }
        return this.nodes[node].number;
    }

    frame boolean(this: *JsonDoc, node: int, fallback: bool) ret bool {
        if (!this.isKind(node, JsonKind.Bool)) {
            return fallback;
        }
        return this.nodes[node].boolean;
    }

    # Integer value if the node is a number with no fractional part in range.
    frame integer(this: *JsonDoc, node: int, out: *long) ret bool {
        if (!this.isKind(node, JsonKind.Number)) {
            return false;
        }
        local v: float = this.nodes[node].number;
        if ((v != v) || (v > 9007199254740992.0) || (v < -9007199254740992.0)) {
            return false;
        }
        local l: long = cast<long>(v);
        if (cast<float>(l) != v) {
            return false;
        }
        *out = l;
        return true;
    }

    frame getStr(this: *JsonDoc, node: int, key: string) ret string {
        return this.str(this.get(node, key));
    }

    frame getNum(this: *JsonDoc, node: int, key: string, fallback: float) ret float {
        return this.num(this.get(node, key), fallback);
    }

    frame getBool(this: *JsonDoc, node: int, key: string, fallback: bool) ret bool {
        return this.boolean(this.get(node, key), fallback);
    }

    # Copies a numeric array into out (up to max); returns the count, or -1 if any element is not a number.
    frame numbers(this: *JsonDoc, node: int, out: *float, max: int) ret int {
        if (!this.isKind(node, JsonKind.Array)) {
            return -1;
        }
        local n: int = 0;
        local cur: int = this.nodes[node].first_child;
        loop (cur >= 0) {
            if (this.nodes[cur].kind != JsonKind.Number) {
                return -1;
            }
            if (n >= max) {
                return -1;
            }
            out[n] = this.nodes[cur].number;
            n = n + 1;
            cur = this.nodes[cur].next;
        }
        return n;
    }

    frame kindName(k: JsonKind) ret string {
        return match (k) {
            JsonKind.Null => "null",
            JsonKind.Bool => "bool",
            JsonKind.Number => "number",
            JsonKind.String => "string",
            JsonKind.Array => "array",
            JsonKind.Object => "object",
        };
    }
}
