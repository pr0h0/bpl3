import printf from "libc";

frame main() ret i64 {
    local a: i64 = 10;
    local b: i32 = 20;
    local c: i16 = 30;
    local d: i8 = 40;

    call printf("a=%d, b=%d, c=%d, d=%d\n", a, b, c, d);
    return 0;
}
