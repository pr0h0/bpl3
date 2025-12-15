extern printf(fmt: string, ...);
# Collatz Conjecture: For any positive integer n,
# if n is even, divide by 2; if odd, multiply by 3 and add 1.
# Repeat until n becomes 1.
frame collatz_step(n: int) ret int {
    if ((n % 2) == 0) {
        return n / 2;
    } else {
        return (n * 3) + 1;
    }
}
frame collatz_sequence(n: int) ret int {
    local steps: int = 0;
    local current: int = n;
    printf("Collatz sequence for %d: ", n);
    loop {
        printf("%d ", current);
        steps = steps + 1;
        if (current == 1) {
            break;
        }
        current = collatz_step(current);
    }
    printf("\n");
    return steps;
}
frame main() ret int {
    local test_numbers: int[5];
    test_numbers[0] = 6;
    test_numbers[1] = 11;
    test_numbers[2] = 27;
    test_numbers[3] = 50;
    test_numbers[4] = 100;
    local i: int = 0;
    loop (i < 5) {
        printf("Found solution in %d steps\n\n", collatz_sequence(test_numbers[i]));
        i = i + 1;
    }
    return 0;
}
