# String utilities

export [StringUtils];

import [String] from "std/string.bpl";
import [Array] from "std/array.bpl";
import [StringBuilder] from "std/string_builder.bpl";
extern strlen(s: string) ret long;
extern free(ptr: *void) ret void;
extern malloc(size: long) ret string;
extern printf(fmt: string, ...) ret int;

# Moves a builder's buffer into a String without copying.
frame _stringUtilsTake(builder: *StringBuilder) ret String {
    local result: String;
    result.data = builder.buffer;
    result.length = builder.length;
    builder.buffer = nullptr;
    builder.length = 0;
    builder.capacity = 0;
    return result;
}

frame _stringUtilsLength(s: string) ret int {
    if (s == nullptr) {
        return 0;
    }
    local length: long = strlen(s);
    if (length > cast<long>(2147483646)) {
        throw "StringUtils input too large";
    }
    return cast<int>(length);
}

frame _stringUtilsSpace(c: char) ret bool {
    return (c == ' ') || (c == '\t') || (c == '\n') || (c == '\r') || (c == cast<char>(11)) || (c == cast<char>(12));
}

frame _stringUtilsLower(c: char) ret char {
    if ((c >= 'A') && (c <= 'Z')) {
        return cast<char>(cast<int>(c) + 32);
    }
    return c;
}

frame _stringUtilsUpper(c: char) ret char {
    if ((c >= 'a') && (c <= 'z')) {
        return cast<char>(cast<int>(c) - 32);
    }
    return c;
}

frame _stringUtilsAlnum(c: char) ret bool {
    return ((c >= 'a') && (c <= 'z')) || ((c >= 'A') && (c <= 'Z')) || ((c >= '0') && (c <= '9'));
}

# Copies `count` bytes of `s` from `start` into a new String.
frame _stringUtilsSlice(s: string, start: int, count: int) ret String {
    local builder: StringBuilder = StringBuilder.new(count);
    loop (local i: int = 0; i < count; i = i + 1) {
        builder.appendChar(s[start + i]);
    }
    return _stringUtilsTake(&builder);
}

struct StringUtils {
    frame startsWith(s: string, prefix: string) ret bool {
        local i: int = 0;
        loop (prefix[i] != 0) {
            if (s[i] == 0) {
                return false;
            }
            if (s[i] != prefix[i]) {
                return false;
            }
            i = i + 1;
        }
        return true;
    }

    frame endsWith(s: string, suffix: string) ret bool {
        local ls: long = strlen(s);
        local lf: long = strlen(suffix);
        if (lf > ls) {
            return false;
        }
        local i: long = 0;
        loop (i < lf) {
            local cs: char = s[(ls - lf) + i];
            local cf: char = suffix[i];
            if (cs != cf) {
                return false;
            }
            i = i + 1;
        }
        return true;
    }

    frame find(s: string, ch: char) ret int {
        local i: int = 0;
        loop (s[i] != 0) {
            if (s[i] == ch) {
                return i;
            }
            i = i + 1;
        }
        return -1;
    }

    # The strings in `parts` joined with `separator` between them, as a new
    # string the caller frees. A null part or separator counts as empty; an
    # empty array gives an empty string. Throws if allocation fails.
    frame join(parts: *Array<string>, separator: string) ret string {
        local separatorLength: long = 0;
        if (separator != nullptr) {
            separatorLength = strlen(separator);
        }
        local total: long = 0;
        loop (local i: int = 0; i < parts.len(); i = i + 1) {
            local part: string = parts.get(i);
            if (part != nullptr) {
                total = total + strlen(part);
            }
            if (i > 0) {
                total = total + separatorLength;
            }
        }
        local output: string = malloc(total + 1);
        if (output == nullptr) {
            throw "StringUtils.join allocation failed";
        }
        local used: long = 0;
        loop (local i: int = 0; i < parts.len(); i = i + 1) {
            if (i > 0) {
                loop (local k: long = 0; k < separatorLength; k = k + 1) {
                    output[used] = separator[k];
                    used = used + 1;
                }
            }
            local part: string = parts.get(i);
            if (part != nullptr) {
                local partLength: long = strlen(part);
                loop (local k: long = 0; k < partLength; k = k + 1) {
                    output[used] = part[k];
                    used = used + 1;
                }
            }
        }
        output[used] = cast<char>(0);
        return output;
    }

    frame trim(s: string) ret String {
        local length: long = strlen(s);
        if (length > cast<long>(2147483646)) {
            throw "StringUtils.trim input too large";
        }
        local len: int = cast<int>(length);
        local start: int = 0;
        local end: int = len - 1;
        # Trim leading spaces (ASCII 32)
        loop (start < len) {
            if (s[start] != cast<char>(32)) {
                break;
            }
            start = start + 1;
        }
        # Trim trailing spaces (ASCII 32)
        loop (end >= start) {
            if (s[end] != cast<char>(32)) {
                break;
            }
            end = end - 1;
        }
        local newlen: int = (end - start) + 1;
        if (newlen <= 0) {
            return String.new("");
        }
        local buf: string = cast<string>(malloc(cast<long>(newlen + 1)));
        if (buf == nullptr) {
            throw "StringUtils.trim allocation failed";
        }
        local i: int = 0;
        loop (i < newlen) {
            buf[i] = s[start + i];
            i = i + 1;
        }
        buf[newlen] = 0;
        local res: String;
        res.data = buf;
        res.length = newlen;
        return res;
    }

    frame replaceChar(s: string, target: char, repl: char) ret String {
        local length: long = strlen(s);
        if (length > cast<long>(2147483646)) {
            throw "StringUtils.replaceChar input too large";
        }
        local len: int = cast<int>(length);
        local buf: string = cast<string>(malloc(cast<long>(len + 1)));
        if (buf == nullptr) {
            throw "StringUtils.replaceChar allocation failed";
        }
        local i: int = 0;
        loop (i < len) {
            local c: char = s[i];
            if (c == target) {
                c = repl;
            }
            # Preserve C-string semantics when replacement introduces NUL.
            if (c == 0) {
                break;
            }
            buf[i] = c;
            i = i + 1;
        }
        buf[i] = 0;
        local res: String;
        res.data = buf;
        res.length = i;
        return res;
    }

    frame findString(haystack: string, needle: string, start: int) ret int {
        if ((haystack == nullptr) || (needle == nullptr) || (start < 0)) {
            return -1;
        }
        local lh: long = strlen(haystack);
        local ln: long = strlen(needle);
        if (cast<long>(start) > lh) {
            return -1;
        }
        if (ln == 0)
            return start;
        if (ln > lh)
            return -1;
        # Keep both offsets wide until returning a representable int index.
        local i: long = cast<long>(start);
        loop ((i <= (lh - ln)) && (i <= cast<long>(2147483647))) {
            local j: long = 0;
            local isMatch: bool = true;
            loop (j < ln) {
                if (haystack[i + j] != needle[j]) {
                    isMatch = false;
                    break;
                }
                j = j + 1;
            }
            if (isMatch)
                return cast<int>(i);
            i = i + 1;
        }
        return -1;
    }

    # Share the String implementation's non-overlapping replacement rules.
    frame replace(s: string, oldStr: string, newStr: string) ret String {
        local original: String = String.new(s);
        defer {
            original.destroy();
        }
        return original.replaceAll(oldStr, newStr);
    }
    # ------------------------------------------------------------------
    # The functions below accept null as an empty string. Functions that
    # return String or Array<String> allocate; the caller destroys them.

    # Whether `needle` occurs in `haystack` ("" always does).
    frame contains(haystack: string, needle: string) ret bool {
        return StringUtils.indexOf(haystack, needle) >= 0;
    }

    # The first byte index of `needle`, or -1.
    frame indexOf(haystack: string, needle: string) ret int {
        local n: int = _stringUtilsLength(haystack);
        local m: int = _stringUtilsLength(needle);
        if (m == 0) {
            return 0;
        }
        loop (local i: int = 0; (i + m) <= n; i = i + 1) {
            local j: int = 0;
            loop ((j < m) && (haystack[i + j] == needle[j])) {
                j = j + 1;
            }
            if (j == m) {
                return i;
            }
        }
        return -1;
    }

    # The last byte index of `needle`, or -1 ("" matches at the end).
    frame lastIndexOf(haystack: string, needle: string) ret int {
        local n: int = _stringUtilsLength(haystack);
        local m: int = _stringUtilsLength(needle);
        if (m == 0) {
            return n;
        }
        loop (local i: int = n - m; i >= 0; i = i - 1) {
            local j: int = 0;
            loop ((j < m) && (haystack[i + j] == needle[j])) {
                j = j + 1;
            }
            if (j == m) {
                return i;
            }
        }
        return -1;
    }

    # Non-overlapping occurrences of a non-empty `needle`.
    frame countOccurrences(haystack: string, needle: string) ret int {
        local n: int = _stringUtilsLength(haystack);
        local m: int = _stringUtilsLength(needle);
        if (m == 0) {
            return 0;
        }
        local count: int = 0;
        local i: int = 0;
        loop ((i + m) <= n) {
            local j: int = 0;
            loop ((j < m) && (haystack[i + j] == needle[j])) {
                j = j + 1;
            }
            if (j == m) {
                count = count + 1;
                i = i + m;
            } else {
                i = i + 1;
            }
        }
        return count;
    }

    # ASCII case-insensitive comparison: negative, zero or positive.
    frame compareIgnoreCase(a: string, b: string) ret int {
        local n: int = _stringUtilsLength(a);
        local m: int = _stringUtilsLength(b);
        local i: int = 0;
        loop ((i < n) && (i < m)) {
            local x: int = cast<int>(_stringUtilsLower(a[i]));
            local y: int = cast<int>(_stringUtilsLower(b[i]));
            if (x != y) {
                return x - y;
            }
            i = i + 1;
        }
        return n - m;
    }

    frame equalsIgnoreCase(a: string, b: string) ret bool {
        return StringUtils.compareIgnoreCase(a, b) == 0;
    }

    # True for an empty string or one made only of ASCII whitespace.
    frame isBlank(s: string) ret bool {
        local n: int = _stringUtilsLength(s);
        loop (local i: int = 0; i < n; i = i + 1) {
            if (!_stringUtilsSpace(s[i])) {
                return false;
            }
        }
        return true;
    }

    # Removes leading and trailing ASCII whitespace (space, tab, CR, LF, VT, FF).
    frame trimWhitespace(s: string) ret String {
        local n: int = _stringUtilsLength(s);
        local start: int = 0;
        loop ((start < n) && _stringUtilsSpace(s[start])) {
            start = start + 1;
        }
        local end: int = n;
        loop ((end > start) && _stringUtilsSpace(s[end - 1])) {
            end = end - 1;
        }
        return _stringUtilsSlice(s, start, end - start);
    }

    frame trimStart(s: string) ret String {
        local n: int = _stringUtilsLength(s);
        local start: int = 0;
        loop ((start < n) && _stringUtilsSpace(s[start])) {
            start = start + 1;
        }
        return _stringUtilsSlice(s, start, n - start);
    }

    frame trimEnd(s: string) ret String {
        local end: int = _stringUtilsLength(s);
        loop ((end > 0) && _stringUtilsSpace(s[end - 1])) {
            end = end - 1;
        }
        return _stringUtilsSlice(s, 0, end);
    }

    # Removes leading and trailing bytes that appear in `chars`.
    frame trimChars(s: string, chars: string) ret String {
        local n: int = _stringUtilsLength(s);
        local start: int = 0;
        loop ((start < n) && (StringUtils.find(chars, s[start]) >= 0)) {
            start = start + 1;
        }
        local end: int = n;
        loop ((end > start) && (StringUtils.find(chars, s[end - 1]) >= 0)) {
            end = end - 1;
        }
        return _stringUtilsSlice(s, start, end - start);
    }

    # `s` without `prefix` when it starts with it (otherwise a copy).
    frame removePrefix(s: string, prefix: string) ret String {
        local n: int = _stringUtilsLength(s);
        if (StringUtils.startsWith(s, prefix)) {
            local m: int = _stringUtilsLength(prefix);
            return _stringUtilsSlice(s, m, n - m);
        }
        return _stringUtilsSlice(s, 0, n);
    }

    # `s` without `suffix` when it ends with it (otherwise a copy).
    frame removeSuffix(s: string, suffix: string) ret String {
        local n: int = _stringUtilsLength(s);
        if (StringUtils.endsWith(s, suffix)) {
            return _stringUtilsSlice(s, 0, n - _stringUtilsLength(suffix));
        }
        return _stringUtilsSlice(s, 0, n);
    }

    # Splits on every occurrence of a non-empty `separator`, keeping empty
    # fields ("a,,b" gives "a", "", "b"). An empty separator yields `s`.
    frame splitBy(s: string, separator: string) ret Array<String> {
        local out: Array<String> = Array<String>.new(4);
        local n: int = _stringUtilsLength(s);
        local m: int = _stringUtilsLength(separator);
        if (m == 0) {
            out.push(_stringUtilsSlice(s, 0, n));
            return out;
        }
        local fieldStart: int = 0;
        local i: int = 0;
        loop ((i + m) <= n) {
            local j: int = 0;
            loop ((j < m) && (s[i + j] == separator[j])) {
                j = j + 1;
            }
            if (j == m) {
                out.push(_stringUtilsSlice(s, fieldStart, i - fieldStart));
                i = i + m;
                fieldStart = i;
            } else {
                i = i + 1;
            }
        }
        out.push(_stringUtilsSlice(s, fieldStart, n - fieldStart));
        return out;
    }

    # Splits on runs of ASCII whitespace, dropping empty fields.
    frame splitWhitespace(s: string) ret Array<String> {
        local out: Array<String> = Array<String>.new(4);
        local n: int = _stringUtilsLength(s);
        local i: int = 0;
        loop (i < n) {
            loop ((i < n) && _stringUtilsSpace(s[i])) {
                i = i + 1;
            }
            local start: int = i;
            loop ((i < n) && !_stringUtilsSpace(s[i])) {
                i = i + 1;
            }
            if (i > start) {
                out.push(_stringUtilsSlice(s, start, i - start));
            }
        }
        return out;
    }

    # Splits into lines on LF, CRLF or CR. A final line terminator does not
    # produce an empty last line.
    frame splitLines(s: string) ret Array<String> {
        local out: Array<String> = Array<String>.new(4);
        local n: int = _stringUtilsLength(s);
        local start: int = 0;
        local i: int = 0;
        loop (i < n) {
            if ((s[i] == '\n') || (s[i] == '\r')) {
                out.push(_stringUtilsSlice(s, start, i - start));
                if ((s[i] == '\r') && ((i + 1) < n) && (s[i + 1] == '\n')) {
                    i = i + 1;
                }
                start = i + 1;
            }
            i = i + 1;
        }
        if (start < n) {
            out.push(_stringUtilsSlice(s, start, n - start));
        }
        return out;
    }

    # Joins Strings with `separator`.
    frame joinStrings(parts: *Array<String>, separator: string) ret String {
        local builder: StringBuilder = StringBuilder.new(16);
        loop (local i: int = 0; i < parts.length; i = i + 1) {
            if (i > 0) {
                builder.append(separator);
            }
            local part: String = parts.data[i];
            if (part.data != nullptr) {
                builder.append(part.data);
            }
        }
        return _stringUtilsTake(&builder);
    }

    # Destroys every String in `parts` and the array itself.
    frame destroyAll(parts: *Array<String>) {
        loop (local i: int = 0; i < parts.length; i = i + 1) {
            local part: String = parts.data[i];
            part.destroy();
        }
        parts.destroy();
    }

    frame toLowerAscii(s: string) ret String {
        local n: int = _stringUtilsLength(s);
        local builder: StringBuilder = StringBuilder.new(n);
        loop (local i: int = 0; i < n; i = i + 1) {
            builder.appendChar(_stringUtilsLower(s[i]));
        }
        return _stringUtilsTake(&builder);
    }

    frame toUpperAscii(s: string) ret String {
        local n: int = _stringUtilsLength(s);
        local builder: StringBuilder = StringBuilder.new(n);
        loop (local i: int = 0; i < n; i = i + 1) {
            builder.appendChar(_stringUtilsUpper(s[i]));
        }
        return _stringUtilsTake(&builder);
    }

    # Upper-cases the first byte.
    frame capitalize(s: string) ret String {
        local n: int = _stringUtilsLength(s);
        local builder: StringBuilder = StringBuilder.new(n);
        loop (local i: int = 0; i < n; i = i + 1) {
            if (i == 0) {
                builder.appendChar(_stringUtilsUpper(s[i]));
            } else {
                builder.appendChar(s[i]);
            }
        }
        return _stringUtilsTake(&builder);
    }

    # Upper-cases the first letter of every whitespace-separated word and
    # lower-cases the rest.
    frame toTitleCase(s: string) ret String {
        local n: int = _stringUtilsLength(s);
        local builder: StringBuilder = StringBuilder.new(n);
        local atWordStart: bool = true;
        loop (local i: int = 0; i < n; i = i + 1) {
            local c: char = s[i];
            if (_stringUtilsSpace(c)) {
                atWordStart = true;
                builder.appendChar(c);
            } else if (atWordStart) {
                builder.appendChar(_stringUtilsUpper(c));
                atWordStart = false;
            } else {
                builder.appendChar(_stringUtilsLower(c));
            }
        }
        return _stringUtilsTake(&builder);
    }

    # Splits an identifier into lower-case words at case changes, digits
    # boundaries and non-alphanumeric bytes, then joins them with `separator`.
    frame _words(s: string, separator: char, camel: bool, pascal: bool) ret String {
        local n: int = _stringUtilsLength(s);
        local builder: StringBuilder = StringBuilder.new(n + 4);
        local wordCount: int = 0;
        local inWord: bool = false;
        loop (local i: int = 0; i < n; i = i + 1) {
            local c: char = s[i];
            if (!_stringUtilsAlnum(c)) {
                inWord = false;
                continue;
            }
            local isUpper: bool = (c >= 'A') && (c <= 'Z');
            local boundary: bool = !inWord;
            if (inWord && isUpper) {
                local previous: char = s[i - 1];
                local previousLower: bool = ((previous >= 'a') && (previous <= 'z')) || ((previous >= '0') && (previous <= '9'));
                # "HTTPServer" splits before the last capital of a run.
                local nextLower: bool = ((i + 1) < n) && (s[i + 1] >= 'a') && (s[i + 1] <= 'z');
                local previousUpper: bool = (previous >= 'A') && (previous <= 'Z');
                boundary = previousLower || (previousUpper && nextLower);
            }
            if (boundary) {
                if ((wordCount > 0) && !camel) {
                    builder.appendChar(separator);
                }
                wordCount = wordCount + 1;
                if ((camel && (wordCount > 1)) || pascal) {
                    builder.appendChar(_stringUtilsUpper(c));
                } else {
                    builder.appendChar(_stringUtilsLower(c));
                }
            } else {
                builder.appendChar(_stringUtilsLower(c));
            }
            inWord = true;
        }
        return _stringUtilsTake(&builder);
    }

    # "HelloWorld", "hello world" or "hello-world" to "hello_world".
    frame toSnakeCase(s: string) ret String {
        return StringUtils._words(s, '_', false, false);
    }

    frame toKebabCase(s: string) ret String {
        return StringUtils._words(s, '-', false, false);
    }

    frame toCamelCase(s: string) ret String {
        return StringUtils._words(s, '_', true, false);
    }

    frame toPascalCase(s: string) ret String {
        return StringUtils._words(s, '_', true, true);
    }

    # Pads both sides with `fill` to `width` bytes (extra padding goes right).
    frame padCenter(s: string, width: int, fill: char) ret String {
        local n: int = _stringUtilsLength(s);
        local builder: StringBuilder = StringBuilder.new(n);
        local total: int = width - n;
        local left: int = 0;
        if (total > 0) {
            left = total / 2;
        }
        loop (local i: int = 0; i < left; i = i + 1) {
            builder.appendChar(fill);
        }
        if (n > 0) {
            builder.append(s);
        }
        loop (local i: int = left + n; i < width; i = i + 1) {
            builder.appendChar(fill);
        }
        return _stringUtilsTake(&builder);
    }

    # `s` repeated `count` times (empty for count <= 0).
    frame repeat(s: string, count: int) ret String {
        local builder: StringBuilder = StringBuilder.new(16);
        if (s != nullptr) {
            loop (local i: int = 0; i < count; i = i + 1) {
                builder.append(s);
            }
        }
        return _stringUtilsTake(&builder);
    }

    # Shortens `s` to at most `width` bytes, ending in `ellipsis` when cut.
    frame truncate(s: string, width: int, ellipsis: string) ret String {
        local n: int = _stringUtilsLength(s);
        if (n <= width) {
            return _stringUtilsSlice(s, 0, n);
        }
        local tail: int = _stringUtilsLength(ellipsis);
        if (tail >= width) {
            return _stringUtilsSlice(ellipsis, 0, width);
        }
        local builder: StringBuilder = StringBuilder.new(width);
        loop (local i: int = 0; i < (width - tail); i = i + 1) {
            builder.appendChar(s[i]);
        }
        if (tail > 0) {
            builder.append(ellipsis);
        }
        return _stringUtilsTake(&builder);
    }

    # Greedy word wrap at `width` bytes per line, joined with "\n". Words
    # longer than the width stay whole on their own line.
    frame wordWrap(s: string, width: int) ret String {
        local words: Array<String> = StringUtils.splitWhitespace(s);
        local builder: StringBuilder = StringBuilder.new(_stringUtilsLength(s) + 1);
        local lineLength: int = 0;
        loop (local i: int = 0; i < words.length; i = i + 1) {
            local word: String = words.data[i];
            if ((lineLength > 0) && ((lineLength + 1 + word.length) > width)) {
                builder.appendChar('\n');
                lineLength = 0;
            } else if (lineLength > 0) {
                builder.appendChar(' ');
                lineLength = lineLength + 1;
            }
            builder.append(word.data);
            lineLength = lineLength + word.length;
        }
        StringUtils.destroyAll(&words);
        return _stringUtilsTake(&builder);
    }

    # Levenshtein edit distance (insertions, deletions, substitutions).
    frame editDistance(a: string, b: string) ret int {
        local n: int = _stringUtilsLength(a);
        local m: int = _stringUtilsLength(b);
        local row: *int = cast<*int>(malloc(cast<long>(m + 1) * sizeof<int>()));
        if (row == nullptr) {
            throw "StringUtils.editDistance allocation failed";
        }
        loop (local j: int = 0; j <= m; j = j + 1) {
            row[j] = j;
        }
        loop (local i: int = 1; i <= n; i = i + 1) {
            local diagonal: int = row[0];
            row[0] = i;
            loop (local j: int = 1; j <= m; j = j + 1) {
                local above: int = row[j];
                local cost: int = 1;
                if (a[i - 1] == b[j - 1]) {
                    cost = 0;
                }
                local best: int = diagonal + cost;
                if ((above + 1) < best) {
                    best = above + 1;
                }
                if ((row[j - 1] + 1) < best) {
                    best = row[j - 1] + 1;
                }
                row[j] = best;
                diagonal = above;
            }
        }
        local result: int = row[m];
        free(cast<*void>(row));
        return result;
    }

    # Length of the longest common prefix in bytes.
    frame commonPrefixLength(a: string, b: string) ret int {
        local n: int = _stringUtilsLength(a);
        local m: int = _stringUtilsLength(b);
        local i: int = 0;
        loop ((i < n) && (i < m) && (a[i] == b[i])) {
            i = i + 1;
        }
        return i;
    }

    # Escapes backslash, quotes and control bytes with C-style sequences
    # (\n, \t, \r, \", \\, \xHH).
    frame escape(s: string) ret String {
        local n: int = _stringUtilsLength(s);
        local builder: StringBuilder = StringBuilder.new(n + 2);
        local digits: string = "0123456789abcdef";
        loop (local i: int = 0; i < n; i = i + 1) {
            local c: char = s[i];
            local code: int = cast<int>(cast<u8>(c));
            if (c == '\n') {
                builder.append("\\n");
            } else if (c == '\t') {
                builder.append("\\t");
            } else if (c == '\r') {
                builder.append("\\r");
            } else if (c == '"') {
                builder.append("\\\"");
            } else if (c == '\\') {
                builder.append("\\\\");
            } else if ((code < 32) || (code == 127)) {
                builder.append("\\x");
                builder.appendChar(digits[code / 16]);
                builder.appendChar(digits[code % 16]);
            } else {
                builder.appendChar(c);
            }
        }
        return _stringUtilsTake(&builder);
    }

    # Reverses `escape` (also accepts \0, \' and \xHH in either case).
    # Throws on a malformed escape.
    frame unescape(s: string) ret String {
        local n: int = _stringUtilsLength(s);
        local builder: StringBuilder = StringBuilder.new(n);
        local i: int = 0;
        loop (i < n) {
            local c: char = s[i];
            if (c != '\\') {
                builder.appendChar(c);
                i = i + 1;
                continue;
            }
            if ((i + 1) >= n) {
                builder.destroy();
                throw "StringUtils.unescape: trailing backslash";
            }
            local next: char = s[i + 1];
            i = i + 2;
            if (next == 'n') {
                builder.appendChar('\n');
            } else if (next == 't') {
                builder.appendChar('\t');
            } else if (next == 'r') {
                builder.appendChar('\r');
            } else if (next == '0') {
                builder.appendChar(cast<char>(0));
            } else if ((next == '"') || (next == '\'') || (next == '\\')) {
                builder.appendChar(next);
            } else if (next == 'x') {
                local value: int = 0;
                loop (local k: int = 0; k < 2; k = k + 1) {
                    local d: char = cast<char>(0);
                    if ((i + k) < n) {
                        d = s[i + k];
                    }
                    local digit: int = -1;
                    if ((d >= '0') && (d <= '9')) {
                        digit = cast<int>(d) - 48;
                    } else if ((d >= 'a') && (d <= 'f')) {
                        digit = (cast<int>(d) - 97) + 10;
                    } else if ((d >= 'A') && (d <= 'F')) {
                        digit = (cast<int>(d) - 65) + 10;
                    }
                    if (digit < 0) {
                        builder.destroy();
                        throw "StringUtils.unescape: bad \\x escape";
                    }
                    value = (value * 16) + digit;
                }
                builder.appendChar(cast<char>(value));
                i = i + 2;
            } else {
                builder.destroy();
                throw "StringUtils.unescape: unknown escape";
            }
        }
        return _stringUtilsTake(&builder);
    }
}
