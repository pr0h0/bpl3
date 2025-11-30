import printf from "libc";
extern printf(fmt: *u8, ...);

frame factorial(n: u64, acc: u64) ret u64 {
    if n == 0 {
        return acc;
    }
    return call factorial(n - 1, acc * n);
}

frame main() ret u8 {
    local result: u64 = call factorial(5, 1);
    call printf("Factorial: %llu\n", result);

    return 0;
}
