# Streaming JSON writer.
#
# The writer tracks nesting so callers never have to place commas by hand.
# Keys and string values are escaped; non-finite numbers become null so every
# response stays valid JSON.

import [StringBuilder] from "std/string_builder.bpl";
import [Math] from "std/math.bpl";
import snprintf from "std/c.bpl";

export [JsonWriter];

struct JsonWriter {
    sb: StringBuilder,
    # One flag per nesting level: true once the level holds an element.
    has_item: bool[64],
    depth: int,
    after_key: bool,
    precision: int,

    frame new(capacity: int) ret JsonWriter {
        local w: JsonWriter;
        w.sb = StringBuilder.new(capacity);
        w.depth = 0;
        w.has_item[0] = false;
        w.after_key = false;
        w.precision = 10;
        return w;
    }

    frame destroy(this: *JsonWriter) {
        this.sb.destroy();
    }

    frame clear(this: *JsonWriter) {
        this.sb.clear();
        this.depth = 0;
        this.has_item[0] = false;
        this.after_key = false;
    }

    frame toString(this: *JsonWriter) ret string {
        return this.sb.toString();
    }

    frame length(this: *JsonWriter) ret int {
        return this.sb.len();
    }

    frame separator(this: *JsonWriter) {
        if (this.after_key) {
            this.after_key = false;
            return;
        }
        if (this.has_item[this.depth]) {
            this.sb.appendChar(',');
        }
        this.has_item[this.depth] = true;
    }

    frame open(this: *JsonWriter, c: char) {
        this.separator();
        this.sb.appendChar(c);
        if (this.depth >= 63) {
            throw "JsonWriter nesting too deep";
        }
        this.depth = this.depth + 1;
        this.has_item[this.depth] = false;
    }

    frame close(this: *JsonWriter, c: char) {
        if (this.depth <= 0) {
            throw "JsonWriter close without open";
        }
        this.depth = this.depth - 1;
        this.sb.appendChar(c);
    }

    frame beginObject(this: *JsonWriter) ret *JsonWriter {
        this.open('{');
        return this;
    }

    frame endObject(this: *JsonWriter) ret *JsonWriter {
        this.close('}');
        return this;
    }

    frame beginArray(this: *JsonWriter) ret *JsonWriter {
        this.open('[');
        return this;
    }

    frame endArray(this: *JsonWriter) ret *JsonWriter {
        this.close(']');
        return this;
    }

    frame escaped(this: *JsonWriter, s: string) {
        this.sb.appendChar('"');
        if (s != nullptr) {
            local i: int = 0;
            loop (s[i] != cast<char>(0)) {
                local c: char = s[i];
                if (c == '"') {
                    this.sb.append("\\\"");
                } else if (c == '\\') {
                    this.sb.append("\\\\");
                } else if (c == '\n') {
                    this.sb.append("\\n");
                } else if (c == '\r') {
                    this.sb.append("\\r");
                } else if (c == '\t') {
                    this.sb.append("\\t");
                } else if ((c >= cast<char>(0)) && (c < cast<char>(32))) {
                    local buf: char[8];
                    snprintf(cast<string>(&buf[0]), 8, "\\u%04x", cast<int>(c));
                    this.sb.append(cast<string>(&buf[0]));
                } else {
                    this.sb.appendChar(c);
                }
                i = i + 1;
            }
        }
        this.sb.appendChar('"');
    }

    frame key(this: *JsonWriter, name: string) ret *JsonWriter {
        this.separator();
        this.escaped(name);
        this.sb.appendChar(':');
        this.after_key = true;
        return this;
    }

    frame str(this: *JsonWriter, value: string) ret *JsonWriter {
        this.separator();
        if (value == nullptr) {
            this.sb.append("null");
        } else {
            this.escaped(value);
        }
        return this;
    }

    frame integer(this: *JsonWriter, value: long) ret *JsonWriter {
        this.separator();
        this.sb.appendLong(value);
        return this;
    }

    frame num(this: *JsonWriter, value: float) ret *JsonWriter {
        this.separator();
        this.appendNumber(value);
        return this;
    }

    frame fixed(this: *JsonWriter, value: float, decimals: int) ret *JsonWriter {
        this.separator();
        if (Math.isNan(value) || Math.isInfinite(value)) {
            this.sb.append("null");
        } else {
            local buf: char[64];
            snprintf(cast<string>(&buf[0]), 64, "%.*f", decimals, value);
            this.sb.append(cast<string>(&buf[0]));
        }
        return this;
    }

    frame boolean(this: *JsonWriter, value: bool) ret *JsonWriter {
        this.separator();
        this.sb.append(value ? "true" : "false");
        return this;
    }

    frame nil(this: *JsonWriter) ret *JsonWriter {
        this.separator();
        this.sb.append("null");
        return this;
    }

    # Appends pre-encoded JSON as one value.
    frame raw(this: *JsonWriter, json: string) ret *JsonWriter {
        this.separator();
        this.sb.append(json);
        return this;
    }

    frame appendNumber(this: *JsonWriter, value: float) {
        if (Math.isNan(value) || Math.isInfinite(value)) {
            this.sb.append("null");
            return;
        }
        local buf: char[64];
        snprintf(cast<string>(&buf[0]), 64, "%.*g", this.precision, value);
        this.sb.append(cast<string>(&buf[0]));
    }

    # Convenience members.
    frame fieldStr(this: *JsonWriter, name: string, value: string) ret *JsonWriter {
        this.key(name);
        return this.str(value);
    }

    frame fieldInt(this: *JsonWriter, name: string, value: long) ret *JsonWriter {
        this.key(name);
        return this.integer(value);
    }

    frame fieldNum(this: *JsonWriter, name: string, value: float) ret *JsonWriter {
        this.key(name);
        return this.num(value);
    }

    frame fieldFixed(this: *JsonWriter, name: string, value: float, decimals: int) ret *JsonWriter {
        this.key(name);
        return this.fixed(value, decimals);
    }

    frame fieldBool(this: *JsonWriter, name: string, value: bool) ret *JsonWriter {
        this.key(name);
        return this.boolean(value);
    }

    frame fieldNull(this: *JsonWriter, name: string) ret *JsonWriter {
        this.key(name);
        return this.nil();
    }

    frame numArray(this: *JsonWriter, values: *float, count: int) ret *JsonWriter {
        this.beginArray();
        loop (local i: int = 0; i < count; i = i + 1) {
            this.num(values[i]);
        }
        return this.endArray();
    }

    frame fieldNumArray(this: *JsonWriter, name: string, values: *float, count: int) ret *JsonWriter {
        this.key(name);
        return this.numArray(values, count);
    }
}
