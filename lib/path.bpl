import [String] from "std/string.bpl";

extern malloc(size: long) ret *void;

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

    # Normalize in one owned buffer, without allocating component Strings.
    frame normalize(path: string) ret String {
        local length: int = pathLength(path);
        local capacity: int = length;
        if (capacity == 0) { capacity = 1; }
        local result: String = allocatePath(cast<long>(capacity));
        local root: int = 0;
        if (Path.isAbsolute(path)) { root = 1; result.data[0] = cast<char>(47); }
        local used: int = root;
        local cursor: int = 0;
        loop (cursor < length) {
            loop (cursor < length && path[cursor] == cast<char>(47)) { cursor = cursor + 1; }
            if (cursor == length) { break; }
            local start: int = cursor;
            loop (cursor < length && path[cursor] != cast<char>(47)) { cursor = cursor + 1; }
            local count: int = cursor - start;
            if (count == 1 && path[start] == cast<char>(46)) { continue; }
            local parent: bool = count == 2 && path[start] == cast<char>(46) && path[start + 1] == cast<char>(46);
            if (parent) {
                if (used > root) {
                    local previous: int = pathComponentStart(result.data, used);
                    local previousParent: bool = used - previous == 2 && result.data[previous] == cast<char>(46) && result.data[previous + 1] == cast<char>(46);
                    if (!previousParent) {
                        used = previous;
                        if (used > root) { used = used - 1; }
                        continue;
                    }
                }
                if (root != 0) { continue; }
            }
            if (used > root) { result.data[used] = cast<char>(47); used = used + 1; }
            loop (local i: int = start; i < cursor; i = i + 1) {
                result.data[used] = path[i];
                used = used + 1;
            }
        }
        if (used == 0) { result.data[0] = cast<char>(46); used = 1; }
        result.data[used] = cast<char>(0);
        result.length = used;
        return result;
    }

    frame resolve(base: string, target: string) ret String {
        pathLength(base);
        pathLength(target);
        if (Path.isAbsolute(target)) { return Path.normalize(target); }
        local joined: String = Path.join(base, target);
        local result: String;
        try {
            result = Path.normalize(joined.data);
        } catch (error: string) {
            joined.destroy();
            throw error;
        }
        joined.destroy();
        return result;
    }

    frame relative(src: string, dest: string) ret String {
        pathLength(src);
        pathLength(dest);
        if (Path.isAbsolute(src) != Path.isAbsolute(dest)) {
            throw "Relative paths require matching roots";
        }
        local source: String = Path.normalize(src);
        local target: String;
        try { target = Path.normalize(dest); }
        catch (error: string) { source.destroy(); throw error; }
        local result: String;
        try { result = relativeNormalized(source, target); }
        catch (error: string) { source.destroy(); target.destroy(); throw error; }
        source.destroy();
        target.destroy();
        return result;
    }
}

# Inputs are canonical lexical paths with the same absolute/relative form.
frame relativeNormalized(source: String, target: String) ret String {
    local sourceEnd: int = source.length;
    local targetEnd: int = target.length;
    if (sourceEnd == 1 && source.data[0] == cast<char>(46)) { sourceEnd = 0; }
    if (targetEnd == 1 && target.data[0] == cast<char>(46)) { targetEnd = 0; }
    local sourceIndex: int = 0;
    if (Path.isAbsolute(source.data)) { sourceIndex = 1; }
    local targetIndex: int = sourceIndex;
    loop (sourceIndex < sourceEnd && targetIndex < targetEnd) {
        local fromEnd: int = sourceIndex;
        local toEnd: int = targetIndex;
        loop (fromEnd < sourceEnd && source.data[fromEnd] != cast<char>(47)) { fromEnd = fromEnd + 1; }
        loop (toEnd < targetEnd && target.data[toEnd] != cast<char>(47)) { toEnd = toEnd + 1; }
        if (fromEnd - sourceIndex != toEnd - targetIndex) { break; }
        local equal: bool = true;
        loop (local i: int = 0; i < fromEnd - sourceIndex; i = i + 1) {
            if (source.data[sourceIndex + i] != target.data[targetIndex + i]) { equal = false; break; }
        }
        if (!equal) { break; }
        sourceIndex = fromEnd;
        targetIndex = toEnd;
        if (sourceIndex < sourceEnd) { sourceIndex = sourceIndex + 1; }
        if (targetIndex < targetEnd) { targetIndex = targetIndex + 1; }
    }
    local parents: int = 0;
    local cursor: int = sourceIndex;
    loop (cursor < sourceEnd) {
        local start: int = cursor;
        loop (cursor < sourceEnd && source.data[cursor] != cast<char>(47)) { cursor = cursor + 1; }
        if (cursor - start == 2 && source.data[start] == cast<char>(46) && source.data[start + 1] == cast<char>(46)) {
            throw "Cannot compute relative path from unresolved parents";
        }
        parents = parents + 1;
        if (cursor < sourceEnd) { cursor = cursor + 1; }
    }
    local suffix: int = targetEnd - targetIndex;
    local length: long = cast<long>(parents) * 3 + suffix;
    if (parents > 0 && suffix == 0) { length = length - 1; }
    local result: String = allocatePath(length);
    local used: int = 0;
    loop (local i: int = 0; i < parents; i = i + 1) {
        result.data[used] = cast<char>(46); result.data[used + 1] = cast<char>(46);
        used = used + 2;
        if (used < result.length) { result.data[used] = cast<char>(47); used = used + 1; }
    }
    loop (local i: int = targetIndex; i < targetEnd; i = i + 1) {
        result.data[used] = target.data[i]; used = used + 1;
    }
    return result;
}
export [Path];
