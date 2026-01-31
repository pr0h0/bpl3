# Bug Hunt: Control Flow Edge Cases
extern printf(fmt: string, ...);

# Test 1: Break outside of loop
frame test_break_outside() {
    # break;  # Should error - uncomment to test
}

# Test 2: Continue outside of loop
frame test_continue_outside() {
    # continue;  # Should error - uncomment to test
}

# Test 3: Return in defer
frame test_return_in_defer() {
    defer {
        printf("In defer\n");
        # return;  # Should this be allowed?
    }
    printf("After defer setup\n");
}

# Test 4: Nested loops with break
frame test_nested_break() {
    loop (local i: int = 0; i < 3; i = i + 1) {
        loop (local j: int = 0; j < 3; j = j + 1) {
            if (j == 1) {
                break; # Should only break inner loop
            }
            printf("i=%d, j=%d\n", i, j);
        }
    }
}

# Test 5: Very deep nesting
frame test_deep_nesting() {
    if (true) {
        if (true) {
            if (true) {
                if (true) {
                    if (true) {
                        if (true) {
                            if (true) {
                                if (true) {
                                    printf("Deep!\n");
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

# Test 6: Loop with no body
frame test_empty_loop() {
    loop (local i: int = 0; i < 0; i = i + 1) {
        # Empty body
    }
}

# Test 7: Infinite loop that breaks immediately
frame test_immediate_break() {
    loop {
        break;
    }
    printf("Escaped infinite loop\n");
}

# Test 8: Switch with only default
frame test_switch_only_default() {
    local x: int = 5;
    switch (x) {
        default:
            printf("Default only\n");
            break;
    }
}

# Test 9: Empty switch
frame test_empty_switch() {
    local x: int = 5;
    switch (x) {
    }
}

frame main() {
    test_return_in_defer();
    test_nested_break();
    test_deep_nesting();
    test_empty_loop();
    test_immediate_break();
    test_switch_only_default();
    test_empty_switch();
    printf("Control flow tests done\n");
}
