import printf from "libc";

frame identity<T>(x: T) ret T {
    return x;
}

frame main() ret i32 {
    local y: u64 = call identity<u64>(42);
    call printf("%llu\n", y);
    return 0;
}
