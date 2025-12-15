# String utilities

export [StringUtils];

import [String] from "std/string.bpl";
extern strlen(s: *char) ret int;
extern malloc(size: i64) ret *char;
extern free(ptr: *char) ret void;
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
        local len: int = strlen(s);
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
            local empty: String;
            empty.data = null;
            empty.length = 0;
            return empty;
        }
        local buf: *char = cast<*char>(malloc(cast<i64>(newlen + 1)));
        local i: int = 0;
        loop (i < newlen) {
            buf[i] = s[start + i];
            i = i + 1;
        }
        buf[newlen] = 0;
        local res: String = String.new(buf);
        free(buf);
        return res;
    }

    frame replaceChar(s: string, target: char, repl: char) ret String {
        local len: int = strlen(s);
        local buf: *char = cast<*char>(malloc(cast<i64>(len + 1)));
        local i: int = 0;
        loop (i < len) {
            local c: char = s[i];
            if (c == target) {
                c = repl;
            }
            buf[i] = c;
            i = i + 1;
        }
        buf[len] = 0;
        local res: String = String.new(buf);
        free(buf);
        return res;
    }
}
