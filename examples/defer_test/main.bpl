extern printf(fmt: string, ...);

frame main() {
    printf("Start\n");

    # Test 1: Basic scope exit
    {
        defer printf("DEFER_1_EXECUTED\n");
        printf("Block 1\n");
    }

    # Test 2: LIFO order
    {
        defer printf("Defer 2A\n");
        defer printf("Defer 2B\n");
        printf("Block 2\n");
    }

    # Test 3: Nested scopes
    {
        defer printf("Defer 3 Outer\n");
        {
            defer printf("Defer 3 Inner\n");
            printf("Block 3 Inner\n");
        }
        printf("Block 3 Outer\n");
    }

    # Test 4: Break in loop
    printf("Loop Break Test:\n");
    loop (local i: int = 0; i < 3; ++i) {
        defer printf("Loop Defer %d\n", i);
        if (i == 1) {
            printf("Breaking at 1\n");
            break;
        }
        printf("Loop Body %d\n", i);
    }

    # Test 5: Continue in loop
    printf("Loop Continue Test:\n");
    loop (local i: int = 0; i < 3; ++i) {
        defer printf("Loop Defer %d\n", i);
        if (i == 1) {
            printf("Continuing at 1\n");
            continue;
        }
        printf("Loop Body %d\n", i);
    }

    # Test 6: Return
    printf("Return Test:\n");
    testReturn();

    # Test 7: Lambda
    printf("Lambda Test:\n");
    local l: Lambda<void>(int) = |x: int| {
        defer printf("Lambda Defer %d\n", x);
        printf("Lambda Body %d\n", x);
    };
    l(42);

    # Test 8: If/Else
    printf("If/Else Test:\n");
    if (true) {
        defer printf("If Defer\n");
        printf("If Body\n");
    } else {
        defer printf("Else Defer\n");
        printf("Else Body\n");
    }

    # Test 9: Switch
    printf("Switch Test:\n");
    switch (1) {
        case 1: {
            defer printf("Case 1 Defer\n");
            printf("Case 1 Body\n");
        }
        default: {
            defer printf("Default Defer\n");
            printf("Default Body\n");
        }
    }

    # Test 10: Throw (Defer should run now)
    printf("Throw Test:\n");
    try {
        defer printf("THROW_DEFER_EXECUTED\n");
        throw 1;
    } catch (e: int) {
        printf("Caught %d\n", e);
    }
    printf("End\n");
}

frame testReturn() {
    defer printf("Return Defer\n");
    printf("Inside testReturn\n");
    return;
}
