extern printf(fmt: string, ...);

frame fib(n: i64) ret i64 {
    if (n < 2) {
        return n;
    }
    return fib(n - 1) + fib(n - 2);
}

frame main() ret int {
    local n: i64 = 40;
    local result: i64 = fib(n);
    printf("Fib(%ld) = %ld\n", n, result);
    return 0;
}
