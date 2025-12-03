import printf from "libc";

frame identity(x: u64) ret u64 {
    return x;
}

frame main() ret i32 {
    local y: u64 = call identity(42);
    call printf("%llu\n", y);
    return 0;
}
