import printf from "libc";

# Recursive implementation (Slow, O(2^n))
frame fib_recursive(n: u64) ret u64 {
    if n <= 1 {
        return n;
    }
    return call fib_recursive(n - 1) + call fib_recursive(n - 2);
}

frame main() ret u64 {
    local n: u64 = 40;
    call printf("Calculating fib(%d)...\n", n);
    local res: u64 = call fib_recursive(n);
    call printf("Result: %llu\n", res);
    return 0;
}
