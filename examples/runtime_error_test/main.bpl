# Runtime Error Test
# This example tests the new runtime error handling with stack traces.

import [printf] from "std/c.bpl";
extern strcmp(s1: *i8, s2: *i8) ret int;
extern atoi(s: *i8) ret int;

struct Point {
    x: int,
    y: int,
}

frame divide(a: int, b: int) ret int {
    return a / b;
}

frame accessNull() {
    local p: *Point = nullptr;
    # This should trigger NullAccessError with a nice stack trace
    printf("x = %d\n", p.x);
}

frame triggerIndexError() {
    local arr: int[5];
    # This should trigger IndexOutOfBoundsError
    printf("arr[10] = %d\n", arr[10]);
}

frame triggerDivByZero() {
    local result: int = divide(10, 0);
    printf("result = %d\n", result);
}

frame recursiveCall(n: int) {
    if (n > 0) {
        recursiveCall(n - 1);
    }
}

frame triggerStackOverflow() {
    # This should trigger StackOverflowError
    recursiveCall(20000);
}

frame main(argc: int, argv: **i8) ret int {
    if (argc < 2) {
        printf("Usage: %s <test>\n", argv[0]);
        printf("Tests: null, index, divzero, stack\n");
        return 1;
    }
    local test: *i8 = argv[1];

    if (strcmp(test, cast<*i8>("null")) == 0) {
        printf("Testing null pointer access...\n");
        accessNull();
    } else if (strcmp(test, cast<*i8>("index")) == 0) {
        printf("Testing index out of bounds...\n");
        triggerIndexError();
    } else if (strcmp(test, cast<*i8>("divzero")) == 0) {
        printf("Testing division by zero...\n");
        triggerDivByZero();
    } else if (strcmp(test, cast<*i8>("stack")) == 0) {
        printf("Testing stack overflow...\n");
        triggerStackOverflow();
    } else {
        printf("Unknown test: %s\n", test);
        return 1;
    }

    return 0;
}
