# Math library for showcase

frame add(a: int, b: int) ret int {
    return a + b;
}

# Generic function example
frame max<T>(a: T, b: T) ret T {
    if (a > b) {
        return a;
    }
    return b;
}

# Factorial with recursion
frame factorial(n: int) ret int {
    if (n <= 1) {
        return 1;
    }
    return n * factorial(n - 1);
}

export add;
export max;
export factorial;
