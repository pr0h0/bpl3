import [Map], [MapNode] from "std/map.bpl";
import [Array] from "std/array.bpl";
import [Option] from "std/option.bpl";
import [StringBuilder] from "std/string_builder.bpl";
import [String] from "std/string.bpl";
import [JSON] from "std/json.bpl";
import [Regex] from "std/regex.bpl";
extern strlen(text: string) ret long;
extern strcmp(a: string, b: string) ret int;
extern strtod(text: string, end: *string) ret double;
export [Validator];

struct Validator {
    errors: Map<string, string>,
    frame new() ret Validator {
        local v: Validator;
        v.errors = Map<string, string>.new();
        return v;
    }
    frame fail(this: *Validator, field: string, reason: string) {
        if (!this.errors.has(field)) {
            this.errors.set(field, reason);
        }
    }
    frame required(this: *Validator, field: string, value: string) ret *Validator {
        if ((value == nullptr) || (value[0] == 0)) {
            this.fail(field, "required");
        }
        return this;
    }
    # Byte length, not Unicode code points.
    frame length(this: *Validator, field: string, value: string, min: int, max: int) ret *Validator {
        if ((min < 0) || (max < min)) {
            throw "Invalid validation length bounds";
        }
        if (value == nullptr) {
            this.fail(field, "required");
            return this;
        }
        local size: long = strlen(value);
        if ((size < cast<long>(min)) || (size > cast<long>(max))) {
            this.fail(field, "length");
        }
        return this;
    }
    # Strict decimal int32; no whitespace, plus sign, truncation, or overflow.
    frame integer(this: *Validator, field: string, value: string, min: int, max: int) ret Option<int> {
        if (max < min) {
            throw "Invalid validation numeric bounds";
        }
        if ((value == nullptr) || (value[0] == 0)) {
            this.fail(field, "integer");
            return Option<int>.None;
        }
        local negative: bool = value[0] == '-';
        local i: int = 0;
        if (negative) {
            i = 1;
        }
        if (value[i] == 0) {
            this.fail(field, "integer");
            return Option<int>.None;
        }
        local total: long = 0;
        loop (value[i] != 0) {
            if ((value[i] < '0') || (value[i] > '9')) {
                this.fail(field, "integer");
                return Option<int>.None;
            }
            total = (total * 10) + cast<long>(value[i] - '0');
            if (total > 2147483648) {
                this.fail(field, "integer");
                return Option<int>.None;
            }
            i = i + 1;
        }
        if (negative) {
            total = -total;
        }
        if ((total < cast<long>(min)) || (total > cast<long>(max))) {
            this.fail(field, "range");
            return Option<int>.None;
        }
        return Option<int>.Some(cast<int>(total));
    }
    frame oneOf(this: *Validator, field: string, value: string, allowed: *Array<string>) ret *Validator {
        if ((value == nullptr) || (allowed == nullptr)) {
            this.fail(field, "choice");
            return this;
        }
        # Prefer integer/length rules for untrusted numeric input.
        loop (local i: int = 0; i < allowed.len(); i = i + 1) {
            if (strcmp(allowed.get(i), value) == 0) {
                return this;
            }
        }
        this.fail(field, "choice");
        return this;
    }
    # Unicode code points (UTF-8 lead bytes), unlike the byte-based length.
    frame chars(this: *Validator, field: string, value: string, min: int, max: int) ret *Validator {
        if ((min < 0) || (max < min)) {
            throw "Invalid validation length bounds";
        }
        if (value == nullptr) {
            this.fail(field, "required");
            return this;
        }
        local count: long = 0;
        loop (local i: long = 0; value[i] != 0; i = i + 1) {
            if ((cast<u8>(value[i]) & cast<u8>(0xC0)) != cast<u8>(0x80)) {
                count = count + 1;
            }
        }
        if ((count < cast<long>(min)) || (count > cast<long>(max))) {
            this.fail(field, "length");
        }
        return this;
    }
    # Strict decimal number: optional '-', digits, optional fraction and
    # exponent; no whitespace, '+', hex, "inf" or "nan". Inclusive bounds.
    frame number(this: *Validator, field: string, value: string, min: double, max: double) ret Option<double> {
        if (!(max >= min)) {
            throw "Invalid validation numeric bounds";
        }
        if ((value == nullptr) || (value[0] == 0)) {
            this.fail(field, "number");
            return Option<double>.None;
        }
        local i: int = 0;
        if (value[i] == '-') {
            i = i + 1;
        }
        local digits: int = 0;
        loop ((value[i] >= '0') && (value[i] <= '9')) {
            i = i + 1;
            digits = digits + 1;
        }
        if (value[i] == '.') {
            i = i + 1;
            local fraction: int = 0;
            loop ((value[i] >= '0') && (value[i] <= '9')) {
                i = i + 1;
                fraction = fraction + 1;
            }
            if (fraction == 0) {
                digits = 0;
            }
        }
        if ((digits > 0) && ((value[i] == 'e') || (value[i] == 'E'))) {
            i = i + 1;
            if ((value[i] == '+') || (value[i] == '-')) {
                i = i + 1;
            }
            local exponent: int = 0;
            loop ((value[i] >= '0') && (value[i] <= '9')) {
                i = i + 1;
                exponent = exponent + 1;
            }
            if (exponent == 0) {
                digits = 0;
            }
        }
        if ((digits == 0) || (value[i] != 0)) {
            this.fail(field, "number");
            return Option<double>.None;
        }
        local parsed: double = strtod(value, cast<*string>(nullptr));
        if ((parsed - parsed) != 0.0) {
            this.fail(field, "number");
            return Option<double>.None;
        }
        if ((parsed < min) || (parsed > max)) {
            this.fail(field, "range");
            return Option<double>.None;
        }
        return Option<double>.Some(parsed);
    }
    # "true"/"false", "1"/"0", "on"/"off" and "yes"/"no" (lowercase), as
    # sent by checkboxes and query strings.
    frame boolean(this: *Validator, field: string, value: string) ret Option<bool> {
        if (value != nullptr) {
            local yes: string[4] = ["true", "1", "on", "yes"];
            local no: string[4] = ["false", "0", "off", "no"];
            loop (local i: int = 0; i < 4; i = i + 1) {
                if (strcmp(value, yes[i]) == 0) {
                    return Option<bool>.Some(true);
                }
                if (strcmp(value, no[i]) == 0) {
                    return Option<bool>.Some(false);
                }
            }
        }
        this.fail(field, "boolean");
        return Option<bool>.None;
    }
    frame isAsciiLetterOrDigit(c: char) ret bool {
        return ((c >= 'a') && (c <= 'z')) || ((c >= 'A') && (c <= 'Z')) || ((c >= '0') && (c <= '9'));
    }
    # Pragmatic address check: printable ASCII local part without spaces,
    # quotes or brackets, one '@', and a dotted domain of letters, digits and
    # inner hyphens; at most 254 bytes. Does not prove deliverability.
    frame email(this: *Validator, field: string, value: string) ret *Validator {
        if ((value == nullptr) || !Validator.emailShape(value)) {
            this.fail(field, "email");
        }
        return this;
    }
    frame emailShape(value: string) ret bool {
        local length: long = strlen(value);
        if ((length < 3) || (length > 254)) {
            return false;
        }
        local at: long = -1;
        loop (local i: long = 0; i < length; i = i + 1) {
            local c: char = value[i];
            if ((cast<u8>(c) <= cast<u8>(32)) || (cast<u8>(c) >= cast<u8>(127)) || (c == '"') || (c == '(') || (c == ')') || (c == '<') || (c == '>') || (c == ',') || (c == ';') || (c == ':') || (c == '[') || (c == ']') || (c == '\\')) {
                return false;
            }
            if (c == '@') {
                if (at >= 0) {
                    return false;
                }
                at = i;
            }
        }
        if ((at < 1) || (at > 64) || (value[0] == '.') || (value[at - 1] == '.')) {
            return false;
        }
        local labels: int = 0;
        local label: int = 0;
        loop (local i: long = at + 1; i <= length; i = i + 1) {
            local c: char = value[i];
            if ((c == '.') || (c == 0)) {
                if ((label == 0) || (label > 63) || (value[i - 1] == '-')) {
                    return false;
                }
                labels = labels + 1;
                label = 0;
            } else if (Validator.isAsciiLetterOrDigit(c) || ((c == '-') && (label > 0))) {
                label = label + 1;
            } else {
                return false;
            }
        }
        return labels >= 2;
    }
    # Absolute http(s) URL with a host and no whitespace or control bytes.
    frame url(this: *Validator, field: string, value: string) ret *Validator {
        local valid: bool = value != nullptr;
        local start: long = 0;
        if (valid) {
            local lower: bool = (value[0] == 'h') && (value[1] == 't') && (value[2] == 't') && (value[3] == 'p');
            if (lower && (value[4] == ':') && (value[5] == '/') && (value[6] == '/')) {
                start = 7;
            } else if (lower && (value[4] == 's') && (value[5] == ':') && (value[6] == '/') && (value[7] == '/')) {
                start = 8;
            } else {
                valid = false;
            }
        }
        if (valid) {
            local host: long = 0;
            loop ((value[start + host] != 0) && (value[start + host] != '/') && (value[start + host] != '?') && (value[start + host] != '#')) {
                host = host + 1;
            }
            valid = (host > 0) && (value[start] != ':') && (value[start] != '@');
            loop (local i: long = 0; valid && (value[i] != 0); i = i + 1) {
                if ((cast<u8>(value[i]) <= cast<u8>(32)) || (value[i] == 127)) {
                    valid = false;
                }
            }
        }
        if (!valid) {
            this.fail(field, "url");
        }
        return this;
    }
    # Canonical 8-4-4-4-12 hexadecimal UUID (any version, either case).
    frame uuid(this: *Validator, field: string, value: string) ret *Validator {
        local valid: bool = (value != nullptr) && (strlen(value) == 36);
        loop (local i: int = 0; valid && (i < 36); i = i + 1) {
            local c: char = value[i];
            if ((i == 8) || (i == 13) || (i == 18) || (i == 23)) {
                valid = c == '-';
            } else {
                valid = ((c >= '0') && (c <= '9')) || ((c >= 'a') && (c <= 'f')) || ((c >= 'A') && (c <= 'F'));
            }
        }
        if (!valid) {
            this.fail(field, "uuid");
        }
        return this;
    }
    # Calendar date YYYY-MM-DD (years 0001-9999, leap years checked).
    frame date(this: *Validator, field: string, value: string) ret *Validator {
        local valid: bool = (value != nullptr) && (strlen(value) == 10) && (value[4] == '-') && (value[7] == '-');
        local parts: int[3] = [0, 0, 0];
        local starts: int[3] = [0, 5, 8];
        local sizes: int[3] = [4, 2, 2];
        loop (local p: int = 0; valid && (p < 3); p = p + 1) {
            loop (local k: int = 0; valid && (k < sizes[p]); k = k + 1) {
                local c: char = value[starts[p] + k];
                valid = (c >= '0') && (c <= '9');
                parts[p] = (parts[p] * 10) + cast<int>(c - '0');
            }
        }
        if (valid) {
            local days: int[12] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
            local year: int = parts[0];
            local month: int = parts[1];
            valid = (year >= 1) && (month >= 1) && (month <= 12) && (parts[2] >= 1);
            if (valid) {
                local limit: int = days[month - 1];
                if ((month == 2) && ((((year % 4) == 0) && ((year % 100) != 0)) || ((year % 400) == 0))) {
                    limit = 29;
                }
                valid = parts[2] <= limit;
            }
        }
        if (!valid) {
            this.fail(field, "date");
        }
        return this;
    }
    # Whole-value regular expression match (std/regex syntax, linear time).
    # The pattern is compiled per call; invalid patterns throw.
    frame matches(this: *Validator, field: string, value: string, pattern: string) ret *Validator {
        local regex: Regex = Regex.compile(pattern);
        local ok: bool = (value != nullptr) && regex.matches(value);
        regex.destroy();
        if (!ok) {
            this.fail(field, "format");
        }
        return this;
    }
    # Confirmation fields: `value` must equal `other` exactly.
    frame same(this: *Validator, field: string, value: string, other: string) ret *Validator {
        if ((value == nullptr) || (other == nullptr) || (strcmp(value, other) != 0)) {
            this.fail(field, "mismatch");
        }
        return this;
    }
    # Records `reason` for `field` unless `condition` holds, for rules
    # computed by the application (`reason` is borrowed).
    frame check(this: *Validator, field: string, condition: bool, reason: string) ret *Validator {
        if (!condition) {
            this.fail(field, reason);
        }
        return this;
    }
    frame error(this: *Validator, field: string) ret Option<string> {
        return this.errors.get(field);
    }
    frame count(this: *Validator) ret int {
        return this.errors.count;
    }
    frame ok(this: *Validator) ret bool {
        return this.errors.count == 0;
    }
    frame json(this: *Validator) ret String {
        local sb: StringBuilder = StringBuilder.new(128);
        local owner: *StringBuilder = &sb;
        defer owner.destroy();
        sb.append("{\"errors\":{");
        local first: bool = true;
        loop (local i: int = 0; i < this.errors.buckets.len(); i = i + 1) {
            local node: *MapNode<string, string> = this.errors.buckets.get(i);
            loop (node != nullptr) {
                if (!first) {
                    sb.append(",");
                }
                first = false;
                local field: String = JSON.stringify<string>(&node.key);
                sb.append(field.data);
                field.destroy();
                sb.append(":");
                local reason: String = JSON.stringify<string>(&node.value);
                sb.append(reason.data);
                reason.destroy();
                node = node.next;
            }
        }
        sb.append("}}");
        return String.new(sb.toString());
    }
    # Field names/reasons are borrowed through destruction.
    frame destroy(this: *Validator) {
        this.errors.destroy();
    }
}
