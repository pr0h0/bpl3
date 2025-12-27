# Path utilities

export [Path];

import [String] from "std/string.bpl";
extern strlen(s: string) ret int;
extern malloc(size: long) ret string;
extern free(ptr: string) ret void;

struct Path {
    frame join(a: string, b: string) ret String {
        local pa: string = cast<string>(a);
        local pb: string = cast<string>(b);
        local la: int = strlen(pa);
        local lb: int = strlen(pb);
        local needSlash: int = 1;
        if (la > 0) {
            local last: char = pa[la - 1];
            if (last == cast<char>(47)) {
                # '/'
                needSlash = 0;
            }
        }
        local extra: int = needSlash;
        local total: int = la + lb + extra;
        local buf: string = malloc(cast<long>(total + 1));
        # copy a
        local i: int = 0;
        loop (i < la) {
            buf[i] = pa[i];
            i = i + 1;
        }
        if (needSlash == 1) {
            buf[i] = cast<char>(47);
            i = i + 1;
        }
        # copy b
        local j: int = 0;
        loop (j < lb) {
            buf[i + j] = pb[j];
            j = j + 1;
        }
        buf[total] = cast<char>(0);
        local res: String = String.new(buf);
        free(buf);
        return res;
    }

    frame basename(p: string) ret String {
        local pp: string = cast<string>(p);
        local lp: int = strlen(pp);
        if (lp == 0) {
            local empty: String;
            empty.data = nullptr;
            empty.length = 0;
            return empty;
        }
        local i: int = lp - 1;
        loop (i >= 0) {
            if (pp[i] == cast<char>(47)) {
                break;
            }
            i = i - 1;
        }
        local start: int = i + 1;
        local len: int = lp - start;
        local buf: string = malloc(cast<long>(len + 1));
        local k: int = 0;
        loop (k < len) {
            buf[k] = pp[start + k];
            k = k + 1;
        }
        buf[len] = cast<char>(0);
        local res: String = String.new(buf);
        free(buf);
        return res;
    }

    frame dirname(p: string) ret String {
        local pp2: string = cast<string>(p);
        local lp: int = strlen(pp2);
        if (lp == 0) {
            local empty: String;
            empty.data = nullptr;
            empty.length = 0;
            return empty;
        }
        local i: int = lp - 1;
        loop (i >= 0) {
            if (pp2[i] == cast<char>(47)) {
                break;
            }
            i = i - 1;
        }
        if (i < 0) {
            # No slash, return empty
            local empty2: String;
            empty2.data = nullptr;
            empty2.length = 0;
            return empty2;
        }
        local len: int = i;
        local buf: string = malloc(cast<long>(len + 1));
        local k: int = 0;
        loop (k < len) {
            buf[k] = pp2[k];
            k = k + 1;
        }
        buf[len] = cast<char>(0);
        local res: String = String.new(buf);
        free(buf);
        return res;
    }
}
