# String utilities

export [StringUtils];

import [String] from "std/string.bpl";
extern strlen(s: string) ret long;
extern malloc(size: long) ret string;
extern printf(fmt: string, ...) ret int;

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
        local ls: int = strlen(s);
        local lf: int = strlen(suffix);
        if (lf > ls) {
            return false;
        }
        local i: int = 0;
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

    frame trim(s: string) ret String {
        local length: long = strlen(s);
        if (length > cast<long>(2147483646)) { throw "StringUtils.trim input too large"; }
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
        if (buf == nullptr) { throw "StringUtils.trim allocation failed"; }
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
        if (length > cast<long>(2147483646)) { throw "StringUtils.replaceChar input too large"; }
        local len: int = cast<int>(length);
        local buf: string = cast<string>(malloc(cast<long>(len + 1)));
        if (buf == nullptr) { throw "StringUtils.replaceChar allocation failed"; }
        local i: int = 0;
        loop (i < len) {
            local c: char = s[i];
            if (c == target) {
                c = repl;
            }
            # Preserve C-string semantics when replacement introduces NUL.
            if (c == 0) { break; }
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
        if (cast<long>(start) > lh) { return -1; }
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
        defer { original.destroy(); }
        return original.replaceAll(oldStr, newStr);
    }
}
