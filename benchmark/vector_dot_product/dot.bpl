extern printf(fmt: string, ...);
extern malloc(size: int) ret *void;
extern free(ptr: *void);

frame main() ret int {
    local count: int = 6000000;
    local bytes: int = count * 8;
    local a: *i64 = cast<*i64>(malloc(bytes));
    local b: *i64 = cast<*i64>(malloc(bytes));

    local i: int = 0;
    loop (i < count) {
        *(a + i) = cast<i64>((i % 97) - 48);
        *(b + i) = cast<i64>((i % 89) - 44);
        i = i + 1;
    }

    local sum: i64 = 0;
    i = 0;
    loop (i < count) {
        sum = sum + (*(a + i) * *(b + i));
        i = i + 1;
    }

    printf("Vector dot: %ld\n", sum);

    free(cast<*void>(a));
    free(cast<*void>(b));
    return 0;
}
