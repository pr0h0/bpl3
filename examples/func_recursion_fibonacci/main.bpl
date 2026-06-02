import [printf] from "std/c.bpl";

frame fib(n: int) ret int {
    if (n <= 1) {
        return n;
    }
    return fib(n - 1) + fib(n - 2);
}

frame main() ret int {
    printf("%d\n", fib(10));
    return 0;
}
