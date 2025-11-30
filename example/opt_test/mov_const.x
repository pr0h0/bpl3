import printf from "libc";

frame main() ret i64 {
    local a: i64 = 10;
    local b: i64 = 20;
    local c: i64 = 30;

    extern printf(fmt: *i8, ...) ret i32;
    call printf("a=%d, b=%d, c=%d\n", a, b, c);

    return 0;
}
