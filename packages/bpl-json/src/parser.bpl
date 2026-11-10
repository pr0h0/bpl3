# Strict RFC 8259 parser producing an owned JsonValue tree.

import [JsonValue], [JsonKind], jsonCopyBytes from "./value.bpl";
import [StringBuilder] from "std/string_builder.bpl";

extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;
extern strlen(text: string) ret long;
extern strtod(text: string, end: *string) ret double;

export [JsonError];
export [Json];

struct JsonError {
    # Static description; empty when parsing succeeded.
    message: string,
    # Byte offset, 1-based line and byte column of the failure.
    offset: long,
    line: int,
    column: int,
    frame none() ret JsonError {
        local error: JsonError;
        error.message = "";
        error.offset = 0;
        error.line = 0;
        error.column = 0;
        return error;
    }
    frame failed(this: *JsonError) ret bool {
        return this.message[0] != 0;
    }
}

struct JsonReader {
    text: string,
    length: long,
    pos: long,
    depth: int,
    max_depth: int,
    message: string,
    frame fail(this: *JsonReader, message: string) ret *JsonValue {
        if (this.message == nullptr) {
            this.message = message;
        }
        return nullptr;
    }
    frame failAt(this: *JsonReader, position: long, message: string) ret *JsonValue {
        this.pos = position;
        return this.fail(message);
    }
    frame skipWhitespace(this: *JsonReader) {
        loop (this.pos < this.length) {
            local c: char = this.text[this.pos];
            if ((c != ' ') && (c != '\t') && (c != '\n') && (c != '\r')) {
                return;
            }
            this.pos = this.pos + 1;
        }
    }
    frame peek(this: *JsonReader) ret char {
        if (this.pos >= this.length) {
            return cast<char>(0);
        }
        return this.text[this.pos];
    }
    frame literal(this: *JsonReader, word: string) ret bool {
        local size: long = strlen(word);
        if ((this.pos + size) > this.length) {
            return false;
        }
        loop (local i: long = 0; i < size; i = i + 1) {
            if (this.text[this.pos + i] != word[i]) {
                return false;
            }
        }
        this.pos = this.pos + size;
        return true;
    }
    frame value(this: *JsonReader) ret *JsonValue {
        this.skipWhitespace();
        local c: char = this.peek();
        if (c == '{') {
            return this.object();
        }
        if (c == '[') {
            return this.array();
        }
        if (c == '"') {
            local text: string = this.string();
            if (text == nullptr) {
                return nullptr;
            }
            return JsonValue.adoptString(text);
        }
        if ((c == '-') || ((c >= '0') && (c <= '9'))) {
            return this.number();
        }
        if (this.literal("true")) {
            return JsonValue.newBool(true);
        }
        if (this.literal("false")) {
            return JsonValue.newBool(false);
        }
        if (this.literal("null")) {
            return JsonValue.newNull();
        }
        if (this.pos >= this.length) {
            return this.fail("unexpected end of input");
        }
        return this.fail("unexpected character");
    }
    frame enter(this: *JsonReader) ret bool {
        this.depth = this.depth + 1;
        if (this.depth > this.max_depth) {
            this.fail("nesting too deep");
            return false;
        }
        return true;
    }
    frame object(this: *JsonReader) ret *JsonValue {
        if (!this.enter()) {
            return nullptr;
        }
        this.pos = this.pos + 1;
        local result: *JsonValue = JsonValue.newObject();
        this.skipWhitespace();
        if (this.peek() == '}') {
            this.pos = this.pos + 1;
            this.depth = this.depth - 1;
            return result;
        }
        loop {
            this.skipWhitespace();
            if (this.peek() != '"') {
                result.destroy();
                return this.fail("expected object key");
            }
            local key: string = this.string();
            if (key == nullptr) {
                result.destroy();
                return nullptr;
            }
            this.skipWhitespace();
            if (this.peek() != ':') {
                free(key);
                result.destroy();
                return this.fail("expected ':'");
            }
            this.pos = this.pos + 1;
            local member: *JsonValue = this.value();
            if (member == nullptr) {
                free(key);
                result.destroy();
                return nullptr;
            }
            result.appendMember(key, member);
            this.skipWhitespace();
            local next: char = this.peek();
            if (next == ',') {
                this.pos = this.pos + 1;
            } else if (next == '}') {
                this.pos = this.pos + 1;
                this.depth = this.depth - 1;
                return result;
            } else {
                result.destroy();
                return this.fail("expected ',' or '}'");
            }
        }
        return nullptr;
    }
    frame array(this: *JsonReader) ret *JsonValue {
        if (!this.enter()) {
            return nullptr;
        }
        this.pos = this.pos + 1;
        local result: *JsonValue = JsonValue.newArray();
        this.skipWhitespace();
        if (this.peek() == ']') {
            this.pos = this.pos + 1;
            this.depth = this.depth - 1;
            return result;
        }
        loop {
            local item: *JsonValue = this.value();
            if (item == nullptr) {
                result.destroy();
                return nullptr;
            }
            result.items.push(item);
            this.skipWhitespace();
            local next: char = this.peek();
            if (next == ',') {
                this.pos = this.pos + 1;
            } else if (next == ']') {
                this.pos = this.pos + 1;
                this.depth = this.depth - 1;
                return result;
            } else {
                result.destroy();
                return this.fail("expected ',' or ']'");
            }
        }
        return nullptr;
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
    frame hex4(this: *JsonReader) ret int {
        if ((this.pos + 4) > this.length) {
            return -1;
        }
        local code: int = 0;
        loop (local i: int = 0; i < 4; i = i + 1) {
            local digit: int = JsonReader.hexDigit(this.text[this.pos + cast<long>(i)]);
            if (digit < 0) {
                return -1;
            }
            code = (code * 16) + digit;
        }
        this.pos = this.pos + 4;
        return code;
    }
    frame appendUtf8(out: *StringBuilder, code: int) {
        if (code < 0x80) {
            out.appendChar(cast<char>(code));
        } else if (code < 0x800) {
            out.appendChar(cast<char>(0xC0 | (code >> 6)));
            out.appendChar(cast<char>(0x80 | (code & 0x3F)));
        } else if (code < 0x10000) {
            out.appendChar(cast<char>(0xE0 | (code >> 12)));
            out.appendChar(cast<char>(0x80 | ((code >> 6) & 0x3F)));
            out.appendChar(cast<char>(0x80 | (code & 0x3F)));
        } else {
            out.appendChar(cast<char>(0xF0 | (code >> 18)));
            out.appendChar(cast<char>(0x80 | ((code >> 12) & 0x3F)));
            out.appendChar(cast<char>(0x80 | ((code >> 6) & 0x3F)));
            out.appendChar(cast<char>(0x80 | (code & 0x3F)));
        }
    }
    # Parses a quoted string at pos; returns an owned copy or nullptr.
    # Rejects raw control characters, embedded NUL (\u0000) and lone
    # surrogates, since values are NUL-terminated strings.
    frame string(this: *JsonReader) ret string {
        this.pos = this.pos + 1;
        local out: StringBuilder = StringBuilder.new(16);
        local owner: *StringBuilder = &out;
        defer owner.destroy();
        loop {
            if (this.pos >= this.length) {
                this.fail("unterminated string");
                return nullptr;
            }
            local c: char = this.text[this.pos];
            if (c == '"') {
                this.pos = this.pos + 1;
                return jsonCopyBytes(out.toString(), cast<long>(out.len()));
            }
            if (cast<u8>(c) < cast<u8>(32)) {
                this.fail("control character in string");
                return nullptr;
            }
            if (c != '\\') {
                out.appendChar(c);
                this.pos = this.pos + 1;
                continue;
            }
            this.pos = this.pos + 1;
            local escape: char = this.peek();
            this.pos = this.pos + 1;
            if (escape == '"') {
                out.appendChar('"');
            } else if (escape == '\\') {
                out.appendChar('\\');
            } else if (escape == '/') {
                out.appendChar('/');
            } else if (escape == 'b') {
                out.appendChar(cast<char>(8));
            } else if (escape == 'f') {
                out.appendChar(cast<char>(12));
            } else if (escape == 'n') {
                out.appendChar('\n');
            } else if (escape == 'r') {
                out.appendChar('\r');
            } else if (escape == 't') {
                out.appendChar('\t');
            } else if (escape == 'u') {
                local code: int = this.hex4();
                if (code < 0) {
                    this.fail("invalid \\u escape");
                    return nullptr;
                }
                if ((code >= 0xD800) && (code <= 0xDBFF)) {
                    if (!this.literal("\\u")) {
                        this.fail("unpaired surrogate");
                        return nullptr;
                    }
                    local low: int = this.hex4();
                    if ((low < 0xDC00) || (low > 0xDFFF)) {
                        this.fail("unpaired surrogate");
                        return nullptr;
                    }
                    code = 0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00);
                } else if ((code >= 0xDC00) && (code <= 0xDFFF)) {
                    this.fail("unpaired surrogate");
                    return nullptr;
                }
                if (code == 0) {
                    this.fail("NUL character in string");
                    return nullptr;
                }
                JsonReader.appendUtf8(&out, code);
            } else {
                this.fail("invalid escape");
                return nullptr;
            }
        }
        return nullptr;
    }
    frame digits(this: *JsonReader) ret long {
        local start: long = this.pos;
        loop ((this.pos < this.length) && (this.text[this.pos] >= '0') && (this.text[this.pos] <= '9')) {
            this.pos = this.pos + 1;
        }
        return this.pos - start;
    }
    frame number(this: *JsonReader) ret *JsonValue {
        local start: long = this.pos;
        local negative: bool = this.peek() == '-';
        if (negative) {
            this.pos = this.pos + 1;
        }
        local integerStart: long = this.pos;
        local integerDigits: long = this.digits();
        if (integerDigits == 0) {
            return this.failAt(start, "invalid number");
        }
        if ((integerDigits > 1) && (this.text[integerStart] == '0')) {
            return this.failAt(start, "leading zero in number");
        }
        local fractional: bool = false;
        if (this.peek() == '.') {
            this.pos = this.pos + 1;
            if (this.digits() == 0) {
                return this.failAt(start, "invalid number");
            }
            fractional = true;
        }
        local c: char = this.peek();
        if ((c == 'e') || (c == 'E')) {
            this.pos = this.pos + 1;
            c = this.peek();
            if ((c == '+') || (c == '-')) {
                this.pos = this.pos + 1;
            }
            if (this.digits() == 0) {
                return this.failAt(start, "invalid number");
            }
            fractional = true;
        }
        local lexeme: string = jsonCopyBytes(this.text + start, this.pos - start);
        local value: *JsonValue = JsonValue.newNumber(strtod(lexeme, cast<*string>(nullptr)));
        free(lexeme);
        if (!fractional && (integerDigits <= 19)) {
            # Exact 64-bit value. A 19-digit literal is compared against the
            # limit digits first; the magnitude is accumulated negatively so
            # -9223372036854775808 fits.
            local fits: bool = true;
            if (integerDigits == 19) {
                local limit: string = "9223372036854775807";
                if (negative) {
                    limit = "9223372036854775808";
                }
                loop (local i: long = 0; i < 19; i = i + 1) {
                    local digit: char = this.text[integerStart + i];
                    if (digit != limit[i]) {
                        fits = digit < limit[i];
                        break;
                    }
                }
            }
            if (fits) {
                local exact: long = 0;
                loop (local i: long = integerStart; i < (integerStart + integerDigits); i = i + 1) {
                    exact = (exact * 10) - cast<long>(this.text[i] - '0');
                }
                if (!negative) {
                    exact = -exact;
                }
                value.integer = exact;
                value.exact = true;
            }
        }
        return value;
    }
}

struct Json {
    # Parses `text`; returns nullptr on error. Caller destroys the result.
    frame parse(text: string) ret *JsonValue {
        local error: JsonError = JsonError.none();
        return Json.parseChecked(text, &error);
    }
    # Parses `text`, recording the failure position in `error`.
    frame parseChecked(text: string, error: *JsonError) ret *JsonValue {
        if (text == nullptr) {
            error.message = "no input";
            return nullptr;
        }
        return Json.parseBytes(text, strlen(text), 256, error);
    }
    # Parses `length` bytes with an explicit nesting limit (1 to 4096).
    frame parseBytes(text: string, length: long, maxDepth: int, error: *JsonError) ret *JsonValue {
        error.message = "";
        error.offset = 0;
        error.line = 0;
        error.column = 0;
        if ((maxDepth < 1) || (maxDepth > 4096)) {
            throw "JSON nesting limit must be 1 to 4096";
        }
        local reader: JsonReader;
        reader.text = text;
        reader.length = length;
        reader.pos = 0;
        reader.depth = 0;
        reader.max_depth = maxDepth;
        reader.message = nullptr;
        local result: *JsonValue = reader.value();
        if (result != nullptr) {
            reader.skipWhitespace();
            if (reader.pos < reader.length) {
                result.destroy();
                result = nullptr;
                reader.fail("trailing characters");
            }
        }
        if (result == nullptr) {
            error.message = reader.message;
            if (error.message == nullptr) {
                error.message = "invalid JSON";
            }
            error.offset = reader.pos;
            error.line = 1;
            error.column = 1;
            loop (local i: long = 0; (i < reader.pos) && (i < length); i = i + 1) {
                if (text[i] == '\n') {
                    error.line = error.line + 1;
                    error.column = 1;
                } else {
                    error.column = error.column + 1;
                }
            }
        }
        return result;
    }
}
