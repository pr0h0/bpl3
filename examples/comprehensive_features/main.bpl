extern printf(fmt: string, ...);
# Edge case: combining all features in complex scenarios
frame fibonacci(n: int) ret (int, int) {
    if (n == 0) {
        return (0, 1);
    }
    if (n == 1) {
        return (1, 1);
    }
    local (a: int, b: int) = fibonacci(n - 1);
    return (b, a + b);
}
frame main() ret int {
    # Recursive tuple function
    local (fib5: int, fib6: int) = fibonacci(5);
    printf("Fibonacci: fib(5)=%d, fib(6)=%d\n", fib5, fib6);

    # Ternary with tuple results from function
    local n: int = 7;
    local (val: int, next: int) = n < 10 ? fibonacci(n) : (0, 0);
    printf("Conditional fib(%d)=%d, next=%d\n", n, val, next);

    # Loop with tuple swap
    local x: int = 1;
    local y: int = 1;
    local i: int = 0;

    loop (i < 5) {

        (x, y) = (y, x + y);

        i = i + 1;
    }
    printf("After loop: x=%d, y=%d\n", x, y);

    # Nested ternary selecting nested tuples
    local depth: int = 2;
    local result: ((int, int), int) = depth == 1 ? ((1, 2), 3) : depth == 2 ? ((4, 5), 6) : ((7, 8), 9);
    local ((r1: int, r2: int), r3: int) = result;
    printf("Selected tuple: (%d, %d), %d\n", r1, r2, r3);

    return 0;
}
