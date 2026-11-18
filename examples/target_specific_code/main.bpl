import printf, malloc, free from "std/c.bpl";

extern posix_memalign(out: **void, alignment: ulong, size: ulong) ret int;

global TABLE: *int = nullptr;

# Picks an allocator for the build target; the branch for other targets is
# not compiled, so posix_memalign is never called on wasm or Windows.
frame allocate(size: ulong) ret *void {
    if (__TARGET_WASM__ || __TARGET_WINDOWS__) {
        return malloc(size);
    }
    local out: *void = nullptr;
    if (posix_memalign(&out, cast<ulong>(64), size) != 0) {
        return nullptr;
    }
    return out;
}

# The loop reads TABLE through a local copy (BUG-824).
frame lookup(out: *int, n: int) {
    loop (local i: int = 0; i < n; i = i + 1) {
        out[i] = TABLE[i] * 2;
    }
}

frame mix(@[noalias] w: *i16, @[noalias] st: *i16) {
    w[0] = cast<i16>(w[0] + (st[0] >> 2));
    w[1] = cast<i16>(w[1] + (st[1] >> 2));
    w[2] = cast<i16>(w[2] + (st[2] >> 2));
    w[3] = cast<i16>(w[3] + (st[3] >> 2));
}

@[noinline]
frame bitsLabel() ret string {
    if (__TARGET_POINTER_BITS__ == 64) {
        return "64-bit";
    }
    return "32-bit";
}

frame main() ret int {
    local table: *int = cast<*int>(allocate(cast<ulong>(4 * sizeof(int))));
    if (table == nullptr) {
        return 1;
    }
    loop (local i: int = 0; i < 4; i = i + 1) {
        table[i] = i + 1;
    }
    TABLE = table;
    local out: int[4] = [0, 0, 0, 0];
    lookup(&out[0], 4);
    printf("lookup %d %d %d %d\n", out[0], out[1], out[2], out[3]);

    local w: i16[4] = [1, 2, 3, 4];
    local st: i16[4] = [8, 8, 8, 8];
    mix(&w[0], &st[0]);
    printf("mix %d %d %d %d\n", cast<int>(w[0]), cast<int>(w[1]), cast<int>(w[2]), cast<int>(w[3]));

    printf("%s wasm=%d\n", bitsLabel(), cast<int>(__TARGET_WASM__));
    free(cast<*void>(table));
    return 0;
}
