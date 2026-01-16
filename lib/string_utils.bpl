# String utilities

export [StringUtils];

import [String] from "std/string.bpl";
import [StringBuilder] from "std/string_builder.bpl";
extern strlen(s: string) ret int;
extern malloc(size: long) ret string;
extern free(ptr: string) ret void;
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
            return String.new("");
        }
        local buf: string = cast<string>(malloc(cast<long>(newlen + 1)));
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
        local buf: string = cast<string>(malloc(cast<long>(len + 1)));
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

    frame findString(haystack: string, needle: string, start: int) ret int {
        local lh: int = strlen(haystack);
        local ln: int = strlen(needle);
        if (ln == 0) 
            return start;
        if (ln > lh) 
            return -1;
        local i: int = start;
        loop (i <= (lh - ln)) {
            local j: int = 0;
            local isMatch: bool = true;
            loop (j < ln) {
                if (haystack[i + j] != needle[j]) {
                    isMatch = false;
                    break;
                }
                j = j + 1;
            }
            if (isMatch) 
                return i;
            i = i + 1;
        }
        return -1;
    }

    frame replace(s: string, oldStr: string, newStr: string) ret String {
        local sb: StringBuilder = StringBuilder.new(1024);
        local i: int = 0;
        local len: int = strlen(s);
        local oldLen: int = strlen(oldStr);

        loop (i < len) {
            local pos: int = StringUtils.findString(s, oldStr, i);
            if (pos == -1) {
                # No more occurrences, append rest
                # Pointer arithmetic for suffix workaround: 
                # We iterate because accessing s+i is unsafe if not handled
                local k: int = i;
                loop (k < len) {
                    sb.appendChar(s[k]);
                    k = k + 1;
                }
                break;
            }
            # Append part before match
            local k: int = i;
            loop (k < pos) {
                sb.appendChar(s[k]);
                k = k + 1;
            }

            # Append new string
            sb.append(newStr);

            # Advance
            i = pos + oldLen;
        }

        return String.new(sb.toString());
    }
}
