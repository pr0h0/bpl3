# Small string helpers over C strings.
#
# The server parses query strings, JSON fields, CSV cells and filter
# expressions. These helpers keep that parsing strict: a number must use the
# whole input, and nothing silently falls back to zero.

import malloc, free, memcpy, strlen, strcmp, strncmp from "std/c.bpl";

extern strtod(text: string, end: *string) ret float;
extern strtoll(text: string, end: *string, base: int) ret long;

export [Text];
export [ParsedFloat];
export [ParsedLong];

struct ParsedFloat {
    ok: bool,
    value: float,
}

struct ParsedLong {
    ok: bool,
    value: long,
}

struct Text {
    frame equals(a: string, b: string) ret bool {
        if ((a == nullptr) || (b == nullptr)) {
            return a == b;
        }
        return strcmp(a, b) == 0;
    }

    frame equalsIgnoreCase(a: string, b: string) ret bool {
        if ((a == nullptr) || (b == nullptr)) {
            return a == b;
        }
        local i: long = 0;
        loop {
            local ca: char = Text.lower(a[i]);
            local cb: char = Text.lower(b[i]);
            if (ca != cb) {
                return false;
            }
            if (ca == cast<char>(0)) {
                return true;
            }
            i = i + 1;
        }
        return true;
    }

    frame length(s: string) ret int {
        if (s == nullptr) {
            return 0;
        }
        return cast<int>(strlen(s));
    }

    frame isEmpty(s: string) ret bool {
        return (s == nullptr) || (s[0] == cast<char>(0));
    }

    frame startsWith(s: string, prefix: string) ret bool {
        if ((s == nullptr) || (prefix == nullptr)) {
            return false;
        }
        return strncmp(s, prefix, strlen(prefix)) == 0;
    }

    frame endsWith(s: string, suffix: string) ret bool {
        if ((s == nullptr) || (suffix == nullptr)) {
            return false;
        }
        local n: long = strlen(s);
        local m: long = strlen(suffix);
        if (m > n) {
            return false;
        }
        return strcmp(cast<string>(cast<*char>(s) + (n - m)), suffix) == 0;
    }

    frame lower(c: char) ret char {
        if ((c >= 'A') && (c <= 'Z')) {
            return cast<char>(c + cast<char>(32));
        }
        return c;
    }

    frame upper(c: char) ret char {
        if ((c >= 'a') && (c <= 'z')) {
            return cast<char>(c - cast<char>(32));
        }
        return c;
    }

    frame isDigit(c: char) ret bool {
        return (c >= '0') && (c <= '9');
    }

    frame isAlpha(c: char) ret bool {
        return ((c >= 'a') && (c <= 'z')) || ((c >= 'A') && (c <= 'Z'));
    }

    frame isAlnum(c: char) ret bool {
        return Text.isDigit(c) || Text.isAlpha(c);
    }

    frame isSpace(c: char) ret bool {
        return (c == ' ') || (c == '\t') || (c == '\n') || (c == '\r');
    }

    frame isIdentStart(c: char) ret bool {
        return Text.isAlpha(c) || (c == '_');
    }

    frame isIdentPart(c: char) ret bool {
        return Text.isAlnum(c) || (c == '_') || (c == '.');
    }

    # Heap copy of the first n bytes; the caller frees it.
    frame copyN(s: string, n: int) ret string {
        local out: string = cast<string>(malloc(cast<long>(n) + 1));
        if (n > 0) {
            memcpy(cast<*void>(out), cast<*void>(s), cast<long>(n));
        }
        out[n] = cast<char>(0);
        return out;
    }

    frame copy(s: string) ret string {
        if (s == nullptr) {
            return Text.copyN("", 0);
        }
        return Text.copyN(s, Text.length(s));
    }

    frame release(s: string) {
        if (s != nullptr) {
            free(cast<*void>(s));
        }
    }

    frame toUpperCopy(s: string) ret string {
        local out: string = Text.copy(s);
        local i: int = 0;
        loop (out[i] != cast<char>(0)) {
            out[i] = Text.upper(out[i]);
            i = i + 1;
        }
        return out;
    }

    frame toLowerCopy(s: string) ret string {
        local out: string = Text.copy(s);
        local i: int = 0;
        loop (out[i] != cast<char>(0)) {
            out[i] = Text.lower(out[i]);
            i = i + 1;
        }
        return out;
    }

    # Strict decimal float: optional sign, digits, optional fraction and
    # exponent. Rejects empty input, trailing garbage, inf and nan.
    frame parseFloat(s: string) ret ParsedFloat {
        local result: ParsedFloat = ParsedFloat { ok: false, value: 0.0 };
        if (Text.isEmpty(s)) {
            return result;
        }
        local i: int = 0;
        if ((s[i] == '-') || (s[i] == '+')) {
            i = i + 1;
        }
        local digits: int = 0;
        loop (Text.isDigit(s[i])) {
            i = i + 1;
            digits = digits + 1;
        }
        if (s[i] == '.') {
            i = i + 1;
            loop (Text.isDigit(s[i])) {
                i = i + 1;
                digits = digits + 1;
            }
        }
        if (digits == 0) {
            return result;
        }
        if ((s[i] == 'e') || (s[i] == 'E')) {
            i = i + 1;
            if ((s[i] == '-') || (s[i] == '+')) {
                i = i + 1;
            }
            local exp_digits: int = 0;
            loop (Text.isDigit(s[i])) {
                i = i + 1;
                exp_digits = exp_digits + 1;
            }
            if (exp_digits == 0) {
                return result;
            }
        }
        if (s[i] != cast<char>(0)) {
            return result;
        }
        local end: string = nullptr;
        result.value = strtod(s, &end);
        result.ok = true;
        return result;
    }

    frame parseLong(s: string) ret ParsedLong {
        local result: ParsedLong = ParsedLong { ok: false, value: 0 };
        if (Text.isEmpty(s)) {
            return result;
        }
        local i: int = 0;
        local negative: bool = false;
        if (s[i] == '-') {
            negative = true;
            i = i + 1;
        } else if (s[i] == '+') {
            i = i + 1;
        }
        if (!Text.isDigit(s[i])) {
            return result;
        }
        local value: long = 0;
        loop (Text.isDigit(s[i])) {
            local d: long = cast<long>(s[i] - '0');
            if (value > ((9223372036854775807 - d) / 10)) {
                return result;
            }
            value = (value * 10) + d;
            i = i + 1;
        }
        if (s[i] != cast<char>(0)) {
            return result;
        }
        result.ok = true;
        result.value = negative ? -value : value;
        return result;
    }

    frame parseIntOr(s: string, fallback: int) ret int {
        local p: ParsedLong = Text.parseLong(s);
        if (!p.ok || (p.value > 2147483647) || (p.value < -2147483648)) {
            return fallback;
        }
        return cast<int>(p.value);
    }

    frame parseFloatOr(s: string, fallback: float) ret float {
        local p: ParsedFloat = Text.parseFloat(s);
        if (!p.ok) {
            return fallback;
        }
        return p.value;
    }

    # Index of c in s at or after start, or -1.
    frame indexOfChar(s: string, c: char, start: int) ret int {
        local i: int = start;
        loop (s[i] != cast<char>(0)) {
            if (s[i] == c) {
                return i;
            }
            i = i + 1;
        }
        return -1;
    }

    frame contains(s: string, needle: string) ret bool {
        return Text.indexOf(s, needle) >= 0;
    }

    frame indexOf(s: string, needle: string) ret int {
        if ((s == nullptr) || (needle == nullptr)) {
            return -1;
        }
        local n: int = Text.length(s);
        local m: int = Text.length(needle);
        if (m == 0) {
            return 0;
        }
        local i: int = 0;
        loop ((i + m) <= n) {
            if (strncmp(cast<string>(cast<*char>(s) + i), needle, cast<long>(m)) == 0) {
                return i;
            }
            i = i + 1;
        }
        return -1;
    }

    # A symbol is 1-12 uppercase letters, digits, '.' or '-', starting with a letter.
    frame isSymbol(s: string) ret bool {
        if (Text.isEmpty(s)) {
            return false;
        }
        local n: int = Text.length(s);
        if ((n > 12) || !((s[0] >= 'A') && (s[0] <= 'Z'))) {
            return false;
        }
        loop (local i: int = 0; i < n; i = i + 1) {
            local c: char = s[i];
            local ok: bool = ((c >= 'A') && (c <= 'Z')) || Text.isDigit(c) || (c == '.') || (c == '-');
            if (!ok) {
                return false;
            }
        }
        return true;
    }

    # FNV-1a 64-bit, used for stable symbol hashing and ETags.
    frame fnv1a(s: string) ret u64 {
        local h: u64 = 0xCBF29CE484222325;
        local i: int = 0;
        loop (s[i] != cast<char>(0)) {
            h = h ^ cast<u64>(cast<uchar>(s[i]));
            h = h * cast<u64>(0x100000001B3);
            i = i + 1;
        }
        return h;
    }

    frame fnv1aBytes(data: *char, n: long) ret u64 {
        local h: u64 = 0xCBF29CE484222325;
        loop (local i: long = 0; i < n; i = i + 1) {
            h = h ^ cast<u64>(cast<uchar>(data[i]));
            h = h * cast<u64>(0x100000001B3);
        }
        return h;
    }
}
