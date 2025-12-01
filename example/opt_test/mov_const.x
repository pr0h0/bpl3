import printf from "libc";
extern printf(fmt: *i8, ...) ret i32;

frame main() ret i64 {
    local a: i64 = 10;
    local b: i64 = 20;
    local c: i64 = 30;

    call printf("a=%d, b=%d, c=%d\n", a, b, c);

    return 0;
}
