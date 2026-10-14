import [Array] from "std/array.bpl";
import [Option] from "std/option.bpl";
import [StringBuilder] from "std/string_builder.bpl";
extern malloc(size: long) ret *void;
extern free(ptr: string);
extern strlen(text: string) ret long;
extern strcmp(a: string, b: string) ret int;
extern memcpy(dest: *void, src: *void, n: long) ret *void;
export [HttpHeaders];
export [HeaderField];
struct HeaderField {
    key: string,
    name: string,
    value: string,
    combined: string,
}
struct HttpHeaders {
    lines: Array<HeaderField>,
    frame new() ret HttpHeaders {
        local result: HttpHeaders;
        result.lines = Array<HeaderField>.new(8);
        return result;
    }
    frame copy(text: string) ret string {
        local size: long = strlen(text);
        local result: string = cast<string>(malloc(size + 1));
        if (result == nullptr) {
            throw "HTTP header allocation failed";
        }
        memcpy(cast<*void>(result), cast<*void>(text), size + 1);
        return result;
    }
    frame token(c: char) ret bool {
        return ((c >= 'a') && (c <= 'z')) || ((c >= 'A') && (c <= 'Z')) || ((c >= '0') && (c <= '9')) || (c == '!') || (c == '#') || (c == '$') || (c == '%') || (c == '&') || (c == '\'') || (c == '*') || (c == '+') || (c == '-') || (c == '.') || (c == '^') || (c == '_') || (c == '`') || (c == '|') || (c == '~');
    }
    frame lower(key: string) ret string {
        if ((key == nullptr) || (key[0] == 0)) {
            throw "Invalid HTTP header name";
        }
        local copy: string = HttpHeaders.copy(key);
        loop (local i: long = 0; copy[i] != 0; i = i + 1) {
            if (!HttpHeaders.token(copy[i])) {
                free(copy);
                throw "Invalid HTTP header name";
            }
            if ((copy[i] >= 'A') && (copy[i] <= 'Z')) {
                copy[i] = copy[i] + cast<char>(32);
            }
        }
        return copy;
    }
    frame validate(value: string) {
        if (value == nullptr) {
            throw "Invalid HTTP header value";
        }
        loop (local i: long = 0; value[i] != 0; i = i + 1) {
            if (((cast<u8>(value[i]) < cast<u8>(32)) && (value[i] != '\t')) || (value[i] == 127)) {
                throw "Invalid HTTP header value";
            }
        }
    }
    frame append(this: *HttpHeaders, key: string, value: string) {
        HttpHeaders.validate(value);
        local name: string = HttpHeaders.lower(key);
        defer free(name);
        local combined: string = nullptr;
        local first: *HeaderField = nullptr;
        local firstIndex: int = -1;
        loop (local i: int = 0; i < this.lines.len(); i = i + 1) {
            local line: *HeaderField = this.lines.getRef(i);
            if (strcmp(line.key, name) == 0) {
                first = line;
                firstIndex = i;
                break;
            }
        }
        if ((first != nullptr) && (strcmp(name, "set-cookie") != 0)) {
            local builder: StringBuilder = StringBuilder.new(64);
            local owner: *StringBuilder = &builder;
            defer owner.destroy();
            builder.append(first.combined);
            if (strcmp(name, "cookie") == 0) {
                builder.append("; ");
            } else {
                builder.append(", ");
            }
            builder.append(value);
            combined = HttpHeaders.copy(builder.toString());
        }
        local field: HeaderField;
        field.key = nullptr;
        field.name = nullptr;
        field.value = nullptr;
        field.combined = nullptr;
        try {
            field.key = HttpHeaders.copy(name);
            field.name = HttpHeaders.copy(key);
            field.value = HttpHeaders.copy(value);
            if (first == nullptr) {
                field.combined = HttpHeaders.copy(value);
            }
            this.lines.push(field);
            if (combined != nullptr) {
                first = this.lines.getRef(firstIndex);
                free(first.combined);
                first.combined = combined;
                combined = nullptr;
            }
        } catch {
            free(field.key);
            free(field.name);
            free(field.value);
            free(field.combined);
            free(combined);
            throw "HTTP header allocation failed";
        }
    }
    frame remove(this: *HttpHeaders, key: string) {
        local name: string = HttpHeaders.lower(key);
        defer free(name);
        local i: int = 0;
        loop (i < this.lines.len()) {
            local line: HeaderField = this.lines.get(i);
            if (strcmp(line.key, name) == 0) {
                free(line.key);
                free(line.name);
                free(line.value);
                free(line.combined);
                this.lines.removeAt(i);
            } else {
                i = i + 1;
            }
        }
    }
    frame set(this: *HttpHeaders, key: string, value: string) {
        HttpHeaders.validate(value);
        # Inputs may borrow a value already stored in this collection.
        local name: string = HttpHeaders.lower(key);
        defer free(name);
        local original: string = HttpHeaders.copy(key);
        defer free(original);
        local copy: string = HttpHeaders.copy(value);
        defer free(copy);
        this.remove(name);
        this.append(original, copy);
    }
    frame get(this: *HttpHeaders, key: string) ret Option<string> {
        local name: string = HttpHeaders.lower(key);
        defer free(name);
        loop (local i: int = 0; i < this.lines.len(); i = i + 1) {
            local line: HeaderField = this.lines.get(i);
            if (strcmp(line.key, name) == 0) {
                return Option<string>.Some(line.combined);
            }
        }
        return Option<string>.None;
    }
    # The caller owns the array; each value borrows this collection.
    frame getAll(this: *HttpHeaders, key: string) ret Array<string> {
        local name: string = HttpHeaders.lower(key);
        defer free(name);
        local result: Array<string> = Array<string>.new(2);
        try {
            loop (local i: int = 0; i < this.lines.len(); i = i + 1) {
                local line: HeaderField = this.lines.get(i);
                if (strcmp(line.key, name) == 0) {
                    result.push(line.value);
                }
            }
        } catch {
            result.destroy();
            throw "HTTP header allocation failed";
        }
        return result;
    }
    frame has(this: *HttpHeaders, key: string) ret bool {
        return this.get(key).isSome();
    }
    frame destroy(this: *HttpHeaders) {
        loop (local i: int = 0; i < this.lines.len(); i = i + 1) {
            local line: HeaderField = this.lines.get(i);
            free(line.key);
            free(line.name);
            free(line.value);
            free(line.combined);
        }
        this.lines.destroy();
    }
}
