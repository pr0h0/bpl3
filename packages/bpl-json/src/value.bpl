# Dynamic JSON values: an owned tree of nulls, booleans, numbers, strings,
# arrays and objects. Every JsonValue is heap allocated; the root owns its
# children, and `destroy()` releases the whole tree.

import [Array] from "std/array.bpl";
import [String] from "std/string.bpl";
import [StringBuilder] from "std/string_builder.bpl";

extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;
extern strlen(text: string) ret long;
extern strcmp(a: string, b: string) ret int;
extern snprintf(buffer: string, size: ulong, format: string, ...) ret int;
extern strtod(text: string, end: *string) ret double;

export [JsonKind];
export [JsonValue];
export jsonCopyString;
export jsonCopyBytes;

enum JsonKind {
    Null,
    Bool,
    Number,
    String,
    Array,
    Object,
}

# Copies `length` bytes of `text` into a new NUL-terminated string.
frame jsonCopyBytes(text: string, length: long) ret string {
    local copy: string = cast<string>(malloc(length + 1));
    if (copy == nullptr) {
        throw "JSON allocation failed";
    }
    loop (local i: long = 0; i < length; i = i + 1) {
        copy[i] = text[i];
    }
    copy[length] = 0;
    return copy;
}

frame jsonCopyString(text: string) ret string {
    if (text == nullptr) {
        return jsonCopyBytes("", 0);
    }
    return jsonCopyBytes(text, strlen(text));
}

struct JsonValue {
    kind: JsonKind,
    boolean: bool,
    # Every number keeps a double. Integer literals that fit in 64 bits also
    # keep their exact value; `exact` says whether `integer` is valid.
    number: double,
    integer: long,
    exact: bool,
    # String payload (owned).
    text: string,
    # Array elements, or object member values (owned).
    items: Array<*JsonValue>,
    # Object member keys in insertion order (owned), parallel to `items`.
    keys: Array<string>,

    frame alloc(kind: JsonKind) ret *JsonValue {
        local value: *JsonValue = cast<*JsonValue>(malloc(sizeof<JsonValue>()));
        if (value == nullptr) {
            throw "JSON allocation failed";
        }
        # Copying a whole struct value also installs its hidden vtable
        # pointer, which raw malloc storage lacks.
        local init: JsonValue;
        init.kind = kind;
        init.boolean = false;
        init.number = 0.0;
        init.integer = 0;
        init.exact = false;
        init.text = nullptr;
        init.items = Array<*JsonValue>.new(0);
        init.keys = Array<string>.new(0);
        *value = init;
        return value;
    }
    frame newNull() ret *JsonValue {
        return JsonValue.alloc(JsonKind.Null);
    }
    frame newBool(flag: bool) ret *JsonValue {
        local value: *JsonValue = JsonValue.alloc(JsonKind.Bool);
        value.boolean = flag;
        return value;
    }
    frame newNumber(number: double) ret *JsonValue {
        local value: *JsonValue = JsonValue.alloc(JsonKind.Number);
        value.number = number;
        return value;
    }
    frame newInt(number: long) ret *JsonValue {
        local value: *JsonValue = JsonValue.alloc(JsonKind.Number);
        value.number = cast<double>(number);
        value.integer = number;
        value.exact = true;
        return value;
    }
    # The text is copied.
    frame newString(text: string) ret *JsonValue {
        local value: *JsonValue = JsonValue.alloc(JsonKind.String);
        value.text = jsonCopyString(text);
        return value;
    }
    # Takes ownership of an already allocated string.
    frame adoptString(text: string) ret *JsonValue {
        local value: *JsonValue = JsonValue.alloc(JsonKind.String);
        value.text = text;
        return value;
    }
    frame newArray() ret *JsonValue {
        return JsonValue.alloc(JsonKind.Array);
    }
    frame newObject() ret *JsonValue {
        return JsonValue.alloc(JsonKind.Object);
    }

    frame isNull(this: *JsonValue) ret bool {
        return this.kind == JsonKind.Null;
    }
    frame isBool(this: *JsonValue) ret bool {
        return this.kind == JsonKind.Bool;
    }
    frame isNumber(this: *JsonValue) ret bool {
        return this.kind == JsonKind.Number;
    }
    # A number with no fractional part (1, 1.0 and 1e2 all count).
    frame isInteger(this: *JsonValue) ret bool {
        if (this.kind != JsonKind.Number) {
            return false;
        }
        if (this.exact) {
            return true;
        }
        local n: double = this.number;
        if ((n != n) || (n > 9200000000000000000.0) || (n < -9200000000000000000.0)) {
            return false;
        }
        return cast<double>(cast<long>(n)) == n;
    }
    frame isString(this: *JsonValue) ret bool {
        return this.kind == JsonKind.String;
    }
    frame isArray(this: *JsonValue) ret bool {
        return this.kind == JsonKind.Array;
    }
    frame isObject(this: *JsonValue) ret bool {
        return this.kind == JsonKind.Object;
    }
    frame kindName(this: *JsonValue) ret string {
        match (this.kind) {
            JsonKind.Null => {
                return "null";
            },
            JsonKind.Bool => {
                return "boolean";
            },
            JsonKind.Number => {
                if (this.isInteger()) {
                    return "integer";
                }
                return "number";
            },
            JsonKind.String => {
                return "string";
            },
            JsonKind.Array => {
                return "array";
            },
            JsonKind.Object => {
                return "object";
            },
        };
        return "null";
    }

    # Typed accessors return the fallback when the kind does not match.
    frame asBool(this: *JsonValue, fallback: bool) ret bool {
        if (this.kind != JsonKind.Bool) {
            return fallback;
        }
        return this.boolean;
    }
    frame asNumber(this: *JsonValue, fallback: double) ret double {
        if (this.kind != JsonKind.Number) {
            return fallback;
        }
        return this.number;
    }
    frame asLong(this: *JsonValue, fallback: long) ret long {
        if (!this.isInteger()) {
            return fallback;
        }
        if (this.exact) {
            return this.integer;
        }
        return cast<long>(this.number);
    }
    # Borrowed; valid until the value is freed or replaced.
    frame asString(this: *JsonValue, fallback: string) ret string {
        if (this.kind != JsonKind.String) {
            return fallback;
        }
        return this.text;
    }

    # Element count of an array or member count of an object; 0 otherwise.
    frame len(this: *JsonValue) ret int {
        if ((this.kind == JsonKind.Array) || (this.kind == JsonKind.Object)) {
            return this.items.len();
        }
        if (this.kind == JsonKind.String) {
            return cast<int>(strlen(this.text));
        }
        return 0;
    }
    # Array element (or object member value by position); nullptr when out of range.
    frame at(this: *JsonValue, index: int) ret *JsonValue {
        if (((this.kind != JsonKind.Array) && (this.kind != JsonKind.Object)) || (index < 0) || (index >= this.items.len())) {
            return nullptr;
        }
        return this.items.get(index);
    }
    # Object key by position; nullptr when out of range or not an object.
    frame keyAt(this: *JsonValue, index: int) ret string {
        if ((this.kind != JsonKind.Object) || (index < 0) || (index >= this.keys.len())) {
            return nullptr;
        }
        return this.keys.get(index);
    }
    frame indexOf(this: *JsonValue, key: string) ret int {
        if ((this.kind != JsonKind.Object) || (key == nullptr)) {
            return -1;
        }
        # Duplicate keys: the last occurrence wins, matching common parsers.
        loop (local i: int = this.keys.len() - 1; i >= 0; i = i - 1) {
            if (strcmp(this.keys.get(i), key) == 0) {
                return i;
            }
        }
        return -1;
    }
    # Object member; nullptr when missing or not an object. Borrowed.
    frame get(this: *JsonValue, key: string) ret *JsonValue {
        local index: int = this.indexOf(key);
        if (index < 0) {
            return nullptr;
        }
        return this.items.get(index);
    }
    frame has(this: *JsonValue, key: string) ret bool {
        return this.indexOf(key) >= 0;
    }
    # Dotted lookup: "user.tags.0" walks objects by key and arrays by index.
    # Keys containing '.' cannot be addressed this way; use get().
    frame path(this: *JsonValue, dotted: string) ret *JsonValue {
        local current: *JsonValue = this;
        local start: long = 0;
        local length: long = strlen(dotted);
        if (length == 0) {
            return this;
        }
        loop ((current != nullptr) && (start <= length)) {
            local end: long = start;
            loop ((end < length) && (dotted[end] != '.')) {
                end = end + 1;
            }
            local segment: string = jsonCopyBytes(dotted + start, end - start);
            if (current.kind == JsonKind.Array) {
                local index: int = 0;
                local valid: bool = segment[0] != 0;
                loop (local i: int = 0; segment[i] != 0; i = i + 1) {
                    if ((segment[i] < '0') || (segment[i] > '9') || (index > 100000000)) {
                        valid = false;
                        break;
                    }
                    index = (index * 10) + cast<int>(segment[i] - '0');
                }
                if (valid) {
                    current = current.at(index);
                } else {
                    current = nullptr;
                }
            } else {
                current = current.get(segment);
            }
            free(segment);
            start = end + 1;
        }
        return current;
    }

    # Path lookups with fallbacks, for optional members: the fallback is
    # returned when any step is missing or the value has another kind.
    frame getString(this: *JsonValue, dotted: string, fallback: string) ret string {
        local found: *JsonValue = this.path(dotted);
        if (found == nullptr) {
            return fallback;
        }
        return found.asString(fallback);
    }
    frame getLong(this: *JsonValue, dotted: string, fallback: long) ret long {
        local found: *JsonValue = this.path(dotted);
        if (found == nullptr) {
            return fallback;
        }
        return found.asLong(fallback);
    }
    frame getNumber(this: *JsonValue, dotted: string, fallback: double) ret double {
        local found: *JsonValue = this.path(dotted);
        if (found == nullptr) {
            return fallback;
        }
        return found.asNumber(fallback);
    }
    frame getBool(this: *JsonValue, dotted: string, fallback: bool) ret bool {
        local found: *JsonValue = this.path(dotted);
        if (found == nullptr) {
            return fallback;
        }
        return found.asBool(fallback);
    }

    # Appends to an array, taking ownership of `item`.
    frame push(this: *JsonValue, item: *JsonValue) ret *JsonValue {
        if (this.kind != JsonKind.Array) {
            throw "JSON push requires an array";
        }
        if (item == nullptr) {
            throw "JSON push requires a value";
        }
        this.items.push(item);
        return this;
    }
    # Sets an object member, taking ownership of `item`; the key is copied.
    # An existing member with the same key is freed and replaced in place.
    frame set(this: *JsonValue, key: string, item: *JsonValue) ret *JsonValue {
        if (this.kind != JsonKind.Object) {
            throw "JSON set requires an object";
        }
        if ((key == nullptr) || (item == nullptr)) {
            throw "JSON set requires a key and value";
        }
        local index: int = this.indexOf(key);
        if (index >= 0) {
            local old: *JsonValue = this.items.get(index);
            if (old != item) {
                old.destroy();
            }
            this.items.set(index, item);
            return this;
        }
        this.keys.push(jsonCopyString(key));
        this.items.push(item);
        return this;
    }
    # Parser path: appends without the duplicate scan and adopts the key.
    frame appendMember(this: *JsonValue, key: string, item: *JsonValue) {
        this.keys.push(key);
        this.items.push(item);
    }
    frame setString(this: *JsonValue, key: string, text: string) ret *JsonValue {
        return this.set(key, JsonValue.newString(text));
    }
    frame setInt(this: *JsonValue, key: string, number: long) ret *JsonValue {
        return this.set(key, JsonValue.newInt(number));
    }
    frame setNumber(this: *JsonValue, key: string, number: double) ret *JsonValue {
        return this.set(key, JsonValue.newNumber(number));
    }
    frame setBool(this: *JsonValue, key: string, flag: bool) ret *JsonValue {
        return this.set(key, JsonValue.newBool(flag));
    }
    frame setNull(this: *JsonValue, key: string) ret *JsonValue {
        return this.set(key, JsonValue.newNull());
    }
    # Removes and frees an object member. Returns whether it existed.
    frame remove(this: *JsonValue, key: string) ret bool {
        local index: int = this.indexOf(key);
        if (index < 0) {
            return false;
        }
        local old: *JsonValue = this.items.get(index);
        old.destroy();
        free(this.keys.get(index));
        this.items.removeAt(index);
        this.keys.removeAt(index);
        return true;
    }
    # Detaches an object member without freeing it; caller owns the result.
    frame take(this: *JsonValue, key: string) ret *JsonValue {
        local index: int = this.indexOf(key);
        if (index < 0) {
            return nullptr;
        }
        local value: *JsonValue = this.items.get(index);
        free(this.keys.get(index));
        this.items.removeAt(index);
        this.keys.removeAt(index);
        return value;
    }

    # Deep copy.
    frame clone(this: *JsonValue) ret *JsonValue {
        local copy: *JsonValue = JsonValue.alloc(this.kind);
        copy.boolean = this.boolean;
        copy.number = this.number;
        copy.integer = this.integer;
        copy.exact = this.exact;
        if (this.text != nullptr) {
            copy.text = jsonCopyString(this.text);
        }
        loop (local i: int = 0; i < this.items.len(); i = i + 1) {
            local child: *JsonValue = this.items.get(i);
            copy.items.push(child.clone());
        }
        loop (local i: int = 0; i < this.keys.len(); i = i + 1) {
            copy.keys.push(jsonCopyString(this.keys.get(i)));
        }
        return copy;
    }

    # Structural equality. Numbers compare by value (1 == 1.0); object member
    # order is ignored.
    frame equals(this: *JsonValue, other: *JsonValue) ret bool {
        if ((this == nullptr) || (other == nullptr)) {
            return this == other;
        }
        if (this.kind != other.kind) {
            return false;
        }
        match (this.kind) {
            JsonKind.Null => {
                return true;
            },
            JsonKind.Bool => {
                return this.boolean == other.boolean;
            },
            JsonKind.Number => {
                if (this.exact && other.exact) {
                    return this.integer == other.integer;
                }
                return this.number == other.number;
            },
            JsonKind.String => {
                return strcmp(this.text, other.text) == 0;
            },
            JsonKind.Array => {
                if (this.items.len() != other.items.len()) {
                    return false;
                }
                loop (local i: int = 0; i < this.items.len(); i = i + 1) {
                    local left: *JsonValue = this.items.get(i);
                    if (!left.equals(other.items.get(i))) {
                        return false;
                    }
                }
                return true;
            },
            JsonKind.Object => {
                if (this.uniqueKeyCount() != other.uniqueKeyCount()) {
                    return false;
                }
                loop (local i: int = 0; i < this.keys.len(); i = i + 1) {
                    local key: string = this.keys.get(i);
                    if (this.indexOf(key) == i) {
                        local mine: *JsonValue = this.items.get(i);
                        if (!mine.equals(other.get(key))) {
                            return false;
                        }
                    }
                }
                return true;
            },
        };
        return false;
    }
    frame uniqueKeyCount(this: *JsonValue) ret int {
        local count: int = 0;
        loop (local i: int = 0; i < this.keys.len(); i = i + 1) {
            if (this.indexOf(this.keys.get(i)) == i) {
                count = count + 1;
            }
        }
        return count;
    }

    # Releases the value and everything it owns. Method calls dispatch
    # through the object, so check for nullptr before calling.
    frame destroy(this: *JsonValue) {
        loop (local i: int = 0; i < this.items.len(); i = i + 1) {
            local child: *JsonValue = this.items.get(i);
            child.destroy();
        }
        loop (local i: int = 0; i < this.keys.len(); i = i + 1) {
            free(this.keys.get(i));
        }
        this.items.destroy();
        this.keys.destroy();
        free(this.text);
        free(cast<*void>(this));
    }

    # Compact JSON text (no whitespace). Non-finite numbers become null.
    frame stringify(this: *JsonValue) ret String {
        local out: StringBuilder = StringBuilder.new(64);
        local owner: *StringBuilder = &out;
        defer owner.destroy();
        this.write(&out, -1, 0);
        return String.new(out.toString());
    }
    # Indented JSON text with `indent` spaces per level (0 to 16).
    frame pretty(this: *JsonValue, indent: int) ret String {
        if ((indent < 0) || (indent > 16)) {
            throw "JSON indent must be 0 to 16";
        }
        local out: StringBuilder = StringBuilder.new(64);
        local owner: *StringBuilder = &out;
        defer owner.destroy();
        this.write(&out, indent, 0);
        return String.new(out.toString());
    }
    frame newline(out: *StringBuilder, indent: int, depth: int) {
        if (indent < 0) {
            return;
        }
        out.appendChar('\n');
        loop (local i: int = 0; i < (indent * depth); i = i + 1) {
            out.appendChar(' ');
        }
    }
    # indent < 0 writes compact output.
    frame write(this: *JsonValue, out: *StringBuilder, indent: int, depth: int) {
        match (this.kind) {
            JsonKind.Null => {
                out.append("null");
            },
            JsonKind.Bool => {
                out.appendBool(this.boolean);
            },
            JsonKind.Number => {
                JsonValue.writeNumber(out, this);
            },
            JsonKind.String => {
                JsonValue.quote(out, this.text);
            },
            JsonKind.Array => {
                out.appendChar('[');
                loop (local i: int = 0; i < this.items.len(); i = i + 1) {
                    if (i > 0) {
                        out.appendChar(',');
                    }
                    JsonValue.newline(out, indent, depth + 1);
                    local child: *JsonValue = this.items.get(i);
                    child.write(out, indent, depth + 1);
                }
                if (this.items.len() > 0) {
                    JsonValue.newline(out, indent, depth);
                }
                out.appendChar(']');
            },
            JsonKind.Object => {
                out.appendChar('{');
                loop (local i: int = 0; i < this.items.len(); i = i + 1) {
                    if (i > 0) {
                        out.appendChar(',');
                    }
                    JsonValue.newline(out, indent, depth + 1);
                    JsonValue.quote(out, this.keys.get(i));
                    out.appendChar(':');
                    if (indent >= 0) {
                        out.appendChar(' ');
                    }
                    local child: *JsonValue = this.items.get(i);
                    child.write(out, indent, depth + 1);
                }
                if (this.items.len() > 0) {
                    JsonValue.newline(out, indent, depth);
                }
                out.appendChar('}');
            },
        };
    }
    frame writeNumber(out: *StringBuilder, value: *JsonValue) {
        if (value.exact) {
            out.appendLong(value.integer);
            return;
        }
        local n: double = value.number;
        if ((n != n) || ((n - n) != 0.0)) {
            out.append("null");
            return;
        }
        # Shortest of %.15g / %.17g that round-trips.
        local buffer: char[40];
        local text: string = cast<string>(&buffer[0]);
        snprintf(text, 40, "%.15g", n);
        if (strtod(text, cast<*string>(nullptr)) != n) {
            snprintf(text, 40, "%.17g", n);
        }
        out.append(text);
    }
    # Writes `text` as a quoted JSON string, escaping quotes, backslashes and
    # control characters. Other bytes (including UTF-8) are copied verbatim.
    frame quote(out: *StringBuilder, text: string) {
        local hex: string = "0123456789abcdef";
        out.appendChar('"');
        loop (local i: long = 0; text[i] != 0; i = i + 1) {
            local c: char = text[i];
            if (c == '"') {
                out.append("\\\"");
            } else if (c == '\\') {
                out.append("\\\\");
            } else if (c == '\n') {
                out.append("\\n");
            } else if (c == '\r') {
                out.append("\\r");
            } else if (c == '\t') {
                out.append("\\t");
            } else if ((cast<u8>(c) < cast<u8>(32)) || (cast<u8>(c) == cast<u8>(127))) {
                local code: int = cast<int>(cast<u8>(c));
                out.append("\\u00");
                out.appendChar(hex[code / 16]);
                out.appendChar(hex[code % 16]);
            } else {
                out.appendChar(c);
            }
        }
        out.appendChar('"');
    }
}
