extern malloc(size: long) ret *void;
extern free(ptr: *void) ret void;
extern memset(dest: *void, value: int, size: int) ret *void;
extern memcpy(dest: *void, src: *void, size: int) ret *void;
extern memmove(dest: *void, src: *void, size: int) ret *void;

frame main() ret int {
    local buffer: *i8 = cast<*i8>(malloc(16));
    local copy: *i8 = cast<*i8>(malloc(16));
    local fill: int = 65;
    local size: int = 8;

    if (memset(cast<*void>(buffer), fill, size) != cast<*void>(buffer)) {
        return 1;
    }

    buffer[1] = cast<i8>(66);
    buffer[2] = cast<i8>(67);

    if (memcpy(cast<*void>(copy), cast<*void>(buffer), size) != cast<*void>(copy)) {
        return 2;
    }

    memmove(cast<*void>(copy + 2), cast<*void>(copy), 4);

    local result: int = cast<int>(copy[0]) + cast<int>(copy[1]) + cast<int>(copy[2]) + cast<int>(copy[3]);
    free(cast<*void>(buffer));
    free(cast<*void>(copy));

    if (result != 262) {
        return result;
    }
    return 0;
}
