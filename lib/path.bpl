# Path utilities

export [Path];

import [String] from "std/string.bpl";
import [Array] from "std/array.bpl";

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
        # If a is empty, or b is absolute? Logic similar to original but simpler join
        # For now keep original logic or improve? 
        # Original logic (concatenation with slash) is fine for basic join.

        local extra: int = needSlash;
        local total: int = la + lb + extra;
        local buf: string = malloc(cast<long>(total + 1));

        local i: int = 0;
        loop (i < la) {
            buf[i] = pa[i];
            i = i + 1;
        }
        if (needSlash == 1) {
            buf[i] = cast<char>(47);
            i = i + 1;
        }
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

    frame basename(path: string) ret String {
        local pp: string = cast<string>(path);
        local lp: int = strlen(pp);
        if (lp == 0) {
            return String.new("");
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

    frame isAbsolute(path: string) ret bool {
        if (path == nullptr) 
            return false;
        return *path == cast<char>(47);
    }

    frame normalize(path: string) ret String {
        local s: String = String.new(path);
        local parts: Array<String> = s.split(cast<char>(47));
        local stack: Array<String> = Array<String>.new(10);

        local i: int = 0;
        loop (i < parts.length) {
            local part: String = parts.get(i);

            if (part == "..") {
                if (stack.length > 0) {
                    stack.removeAt(stack.length - 1);
                }
            } else {
                local skip: bool = false;
                if (part == ".") {
                    skip = true;
                }
                if (part.length == 0) {
                    skip = true;
                }
                if (!skip) {
                    stack.push(part.clone());
                }
            }
            i = i + 1;
        }

        local res: String;
        if (Path.isAbsolute(path)) {
            res = String.new("/");
        } else {
            res = String.new("");
        }

        local j: int = 0;
        loop (j < stack.length) {
            if (j > 0) {
                # Add separator
                res = res + "/";
            } else {
                # If absolute root, and this is first component?
                # normalization of "/a" -> stack=["a"]. res="/" -> res="/a". Correct.
                # normalizaiton of "a" -> stack=["a"]. res="" -> res="a". Correct.
                # If res is "/" (absolute) and stack has items, do we need extra slash?
                # "/" + "a" -> "/a". Yes.
                # But if res is "/" already?
                # String add of "/" + "a" -> "/a".
                # If res has length > 0 (absolute), and j==0?
                # If res="/" and we append "a", we get "/a". 
                # Seems implicit / is handled by res initialization if absolute.
                # But wait, if absolute, res="/". stack=["a"].
                # j=0. Loop condition j>0 is false.
                # res = "/" + "a" = "/a". Correct.
                # If j=1. res="/a". condition j>0 is true.
                # res = "/a" + "/" = "/a/".
                # res = "/a/" + "b" = "/a/b". Correct.
            }
            # Special check: if res is "/" logic above:
            # j=0. res="/". res = res + "a" = "/a". Correct.

            # What if res is "" (relative)
            # j=0. res="". res=res+"a" = "a". Correct.
            # j=1. res="a". j>0. res="a" + "/" = "a/". res="a/b". Correct.

            # One edge case: if absolute path "/" -> parts=["",""]. stack empty.
            # returns "/". Correct.

            # Another: isAbsolute check uses 'path' (char*) not s.
            if ((res.length > 0) && (res.get(res.length - 1) != cast<char>(47))) {
                res = res + "/";
            }
            res = res + stack.get(j);
            j = j + 1;
        }

        parts.destroy();
        stack.destroy();
        s.destroy();
        return res;
    }

    frame resolve(base: string, relative: string) ret String {
        if (Path.isAbsolute(relative)) {
            return Path.normalize(relative);
        }
        local joined: String = Path.join(base, relative);
        local normalized: String = Path.normalize(joined.toString());
        joined.destroy();
        return normalized;
    }

    frame dirname(p: string) ret String {
        local pp2: string = cast<string>(p);
        local lp: int = strlen(pp2);
        if (lp == 0) {
            return String.new(".");
        }
        local i: int = lp - 1;
        loop (i >= 0) {
            if (pp2[i] == cast<char>(47)) {
                break;
            }
            i = i - 1;
        }
        if (i < 0) {
            return String.new(".");
        }
        if (i == 0) {
            return String.new("/");
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
