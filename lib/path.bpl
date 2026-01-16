import [String] from "std/string.bpl";
import [Array] from "std/array.bpl";
import [StringBuilder] from "std/string_builder.bpl";

extern strlen(s: string) ret int;
extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;

struct Path {
    frame join(a: string, b: string) ret String {
        local pa: string = a;
        local pb: string = b;
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

    frame dirname(path: string) ret String {
        local len: int = strlen(path);
        if (len == 0) {
            return String.new(".");
        }
        local i: int = len - 1;

        loop (i >= 0) {
            local c: char = path[i];
            if (c == cast<char>(47)) {
                if (i == 0) {
                    return String.new("/");
                }
                local buf: string = malloc(cast<long>(i + 1));
                local k: int = 0;
                loop (k < i) {
                    buf[k] = path[k];
                    k = k + 1;
                }
                buf[k] = cast<char>(0);
                local s: String = String.new(buf);
                free(buf);
                return s;
            }
            i = i - 1;
        }
        return String.new(".");
    }

    frame basename(path: string) ret String {
        local len: int = strlen(path);
        if (len == 0) {
            return String.new("");
        }
        local i: int = len - 1;
        loop (i >= 0) {
            local c: char = path[i];
            if (c == cast<char>(47)) {
                local start: int = i + 1;
                local subLen: int = len - start;
                local buf: string = malloc(cast<long>(subLen + 1));
                local k: int = 0;
                loop (k < subLen) {
                    buf[k] = path[start + k];
                    k = k + 1;
                }
                buf[subLen] = cast<char>(0);
                local s: String = String.new(buf);
                free(buf);
                return s;
            }
            i = i - 1;
        }
        return String.new(path);
    }

    frame isAbsolute(path: string) ret bool {
        if (path == nullptr) {
            return false;
        }
        local c: char = path[0];
        return c == cast<char>(47);
    }

    frame extname(path: string) ret String {
        local len: int = strlen(path);
        if (len == 0) {
            return String.new("");
        }
        local i: int = len - 1;
        loop (i >= 0) {
            local c: char = path[i];
            if (c == cast<char>(46)) {
                local start: int = i;
                local subLen: int = len - start;
                local buf: string = malloc(cast<long>(subLen + 1));
                local k: int = 0;
                loop (k < subLen) {
                    buf[k] = path[start + k];
                    k = k + 1;
                }
                buf[subLen] = cast<char>(0);
                local s: String = String.new(buf);
                free(buf);
                return s;
            }
            if (c == cast<char>(47)) {
                return String.new("");
            }
            i = i - 1;
        }
        return String.new("");
    }

    frame normalize(path: string) ret String {
        local s: String = String.new(path);
        local parts: Array<String> = s.split(cast<char>(47));
        local stack: Array<String> = Array<String>.new(parts.length);

        local isAbs: bool = Path.isAbsolute(path);

        local i: int = 0;
        loop (i < parts.length) {
            local part: String = parts.get(i);

            if (part.length > 0) {
                if (part == "..") {
                    local popped: bool = false;
                    if (stack.length > 0) {
                        local top: String = stack.get(stack.length - 1);
                        if (top == "..") {
                            # cannot pop '..'
                        } else {
                            # pop
                            stack.pop();
                            popped = true;
                        }
                    }
                    if (!popped) {
                        if (stack.length > 0) {
                            local top: String = stack.get(stack.length - 1);
                            if (top == "..") {
                                stack.push(part);
                            }
                        } else {
                            if (!isAbs) {
                                stack.push(part);
                            }
                        }
                    }
                } else {
                    if (!(part == ".")) {
                        stack.push(part);
                    }
                }
            }
            i = i + 1;
        }

        local joinedSb: StringBuilder = StringBuilder.new(strlen(path) + 16);
        local m: int = 0;
        loop (m < stack.length) {
            if (m > 0) {
                joinedSb.append("/");
            }
            joinedSb.append(stack.get(m).toString());
            m = m + 1;
        }

        local joined: String = String.new(joinedSb.toString());

        if (isAbs) {
            if (joined.length == 0) {
                return String.new("/");
            }
            return String.new("/") + joined;
        }
        if (joined.length == 0) {
            return String.new(".");
        }
        return joined;
    }

    frame resolve(base: string, target: string) ret String {
        if (Path.isAbsolute(target)) {
            return Path.normalize(target);
        }
        local joined: String = Path.join(base, target);
        local normalized: String = Path.normalize(joined.data);
        joined.destroy();
        return normalized;
    }

    frame relative(src: string, dest: string) ret String {
        local la: int = strlen(src);
        local lb: int = strlen(dest);

        if (la == 0) {
            return String.new(dest);
        }
        local i: int = 0;
        local matches: bool = true;
        loop (i < la) {
            if (i >= lb) {
                matches = false;
                break;
            }
            if (src[i] != dest[i]) {
                matches = false;
                break;
            }
            i = i + 1;
        }

        if (matches) {
            if (la == lb) {
                return String.new("");
            }
            if (dest[la] == cast<char>(47)) {
                local start: int = la + 1;
                local subLen: int = lb - start;
                local buf: string = malloc(cast<long>(subLen + 1));
                local k: int = 0;
                loop (k < subLen) {
                    buf[k] = dest[start + k];
                    k = k + 1;
                }
                buf[subLen] = cast<char>(0);
                local res: String = String.new(buf);
                free(buf);
                return res;
            }
        }
        return String.new(dest);
    }
}
export [Path];
