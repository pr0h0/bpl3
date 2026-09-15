import [String] from "std/string.bpl";
import [Array] from "std/array.bpl";
import [StringBuilder] from "std/string_builder.bpl";

extern strlen(s: string) ret int;
extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;

# Bound lengths before int arithmetic and reject null C strings consistently.
frame pathLength(path: string) ret int {
    if (path == nullptr) { throw "Path cannot be null"; }
    local length: int = 0;
    loop (path[length] != cast<char>(0)) {
        if (length == 2147483646) { throw "Path is too long"; }
        length = length + 1;
    }
    return length;
}

frame allocatePath(length: long) ret String {
    if (length < 0 || length > 2147483646) { throw "Path is too long"; }
    local result: String;
    result.data = cast<string>(malloc(length + 1));
    if (result.data == nullptr) { throw "Cannot allocate path"; }
    result.length = cast<int>(length);
    result.data[result.length] = cast<char>(0);
    return result;
}

frame copyPathRange(path: string, start: int, end: int) ret String {
    local result: String = allocatePath(cast<long>(end - start));
    loop (local i: int = start; i < end; i = i + 1) {
        result.data[i - start] = path[i];
    }
    return result;
}

frame pathEnd(path: string, length: int) ret int {
    local end: int = length;
    loop (end > 0 && path[end - 1] == cast<char>(47)) { end = end - 1; }
    return end;
}

frame pathComponentStart(path: string, end: int) ret int {
    local start: int = end;
    loop (start > 0 && path[start - 1] != cast<char>(47)) { start = start - 1; }
    return start;
}

struct Path {
    # Join at one slash boundary; normalization is a separate operation.
    frame join(a: string, b: string) ret String {
        local la: int = pathLength(a);
        local lb: int = pathLength(b);
        if (la == 0) {
            if (lb == 0) { return copyPathRange(".", 0, 1); }
            return copyPathRange(b, 0, lb);
        }
        if (lb == 0) { return copyPathRange(a, 0, la); }
        local end: int = pathEnd(a, la);
        local start: int = 0;
        loop (start < lb && b[start] == cast<char>(47)) { start = start + 1; }
        local result: String = allocatePath(cast<long>(end) + 1 + (lb - start));
        loop (local i: int = 0; i < end; i = i + 1) { result.data[i] = a[i]; }
        result.data[end] = cast<char>(47);
        loop (local i: int = start; i < lb; i = i + 1) {
            result.data[end + 1 + (i - start)] = b[i];
        }
        return result;
    }

    frame dirname(path: string) ret String {
        local length: int = pathLength(path);
        local end: int = pathEnd(path, length);
        if (end == 0) {
            if (length == 0) { return copyPathRange(".", 0, 1); }
            return copyPathRange("/", 0, 1);
        }
        local start: int = pathComponentStart(path, end);
        if (start == 0) { return copyPathRange(".", 0, 1); }
        local parentEnd: int = pathEnd(path, start);
        if (parentEnd == 0) { return copyPathRange("/", 0, 1); }
        return copyPathRange(path, 0, parentEnd);
    }

    frame basename(path: string) ret String {
        local end: int = pathEnd(path, pathLength(path));
        return copyPathRange(path, pathComponentStart(path, end), end);
    }

    frame isAbsolute(path: string) ret bool {
        if (path == nullptr) { return false; }
        return path[0] == cast<char>(47);
    }

    frame extname(path: string) ret String {
        local end: int = pathEnd(path, pathLength(path));
        local start: int = pathComponentStart(path, end);
        if (end - start == 2 && path[start] == cast<char>(46) && path[start + 1] == cast<char>(46)) {
            return copyPathRange("", 0, 0);
        }
        local i: int = end - 1;
        loop (i > start) {
            if (path[i] == cast<char>(46)) { return copyPathRange(path, i, end); }
            i = i - 1;
        }
        return copyPathRange("", 0, 0);
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
