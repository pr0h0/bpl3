extern printf(fmt: string, ...);
frame fib(n: int) ret int {
    if (n <= 1) {
        return n;
    }
    return fib(n - 1) + fib(n - 2);
}
frame main() ret int {
    local result: int = fib(10);
    printf("Fibonacci of 10 is: %d\n", result);
    return 0;
}
