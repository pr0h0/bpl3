# Bug Hunt: Defer Edge Cases
extern printf(fmt: string, ...);

# Test 1: Multiple defers - order should be reverse
frame test_multiple_defers() {
    defer {
        printf("Defer 1\n");
    }
    defer {
        printf("Defer 2\n");
    }
    defer {
        printf("Defer 3\n");
    }
    printf("In function\n");
}

# Test 2: Defer with early return
frame test_defer_early_return() ret int {
    defer {
        printf("Defer with early return\n");
    }
    if (true) {
        return 1;
    }
    printf("After if\n");
    return 0;
}

# Test 3: Defer with throw
frame test_defer_throw() {
    defer {
        printf("Defer before throw\n");
    }
    try {
        defer {
            printf("Defer in try\n");
        }
        throw 42;
    } catch (e: int) {
        printf("Caught: %d\n", e);
    }
}

# Test 4: Nested defer scopes
frame test_nested_defer() {
    defer {
        printf("Outer defer\n");
    }
    {
        defer {
            printf("Inner defer\n");
        }
        printf("Inner scope\n");
    }
    printf("Outer scope\n");
}

# Test 5: Defer with break in loop
frame test_defer_break() {
    loop (local i: int = 0; i < 3; i = i + 1) {
        defer {
            printf("Loop defer %d\n", i);
        }
        if (i == 1) {
            break;
        }
        printf("Loop body %d\n", i);
    }
    printf("After loop\n");
}

# Test 6: Defer with continue
frame test_defer_continue() {
    loop (local i: int = 0; i < 3; i = i + 1) {
        defer {
            printf("Continue defer %d\n", i);
        }
        if (i == 1) {
            continue;
        }
        printf("Continue body %d\n", i);
    }
}

frame main() {
    printf("=== Multiple defers ===\n");
    test_multiple_defers();

    printf("\n=== Defer early return ===\n");
    local r: int = test_defer_early_return();
    printf("Returned: %d\n", r);

    printf("\n=== Defer throw ===\n");
    test_defer_throw();

    printf("\n=== Nested defer ===\n");
    test_nested_defer();

    printf("\n=== Defer break ===\n");
    test_defer_break();

    printf("\n=== Defer continue ===\n");
    test_defer_continue();
}
