extern printf(fmt: string, ...);

struct Data {
    value: int,
    flag: bool,
}

# Test assigning nullptr after valid data
frame testValidThenNull() {
    printf("Test 1: Valid data then nullptr\n");
    local val: Data;
    local d: *Data = &val;
    d.value = 100;
    d.flag = true;
    printf("Initial value: %d\n", d.value);

    # Now assign nullptr
    d = nullptr;
    printf("Assigned nullptr, now accessing...\n");
    local _val: int = d.value; # Should trap
    printf("Should not reach here\n");
}

# Test nullptr assignment in conditional
frame testConditionalAssignment(useNull: bool) {
    printf("Test 2: Conditional nullptr assignment\n");
    local storage: Data;
    local d: *Data = &storage;

    if (useNull) {
        d = nullptr;
        printf("Set to nullptr\n");
    } else {
        d.value = 42;
        printf("Set to 42\n");
    }

    # Access regardless
    printf("Accessing d.value...\n");
    local val: int = d.value; # Should trap if useNull was true
    printf("Value: %d\n", val);
}

# Test reassignment from nullptr to valid
frame testNullToValid() {
    printf("Test 3: Nullptr to valid\n");
    local d: *Data = nullptr;

    # Create a new valid struct (not assigning fields to nullptr object)
    local valid: Data;
    valid.value = 50;
    valid.flag = false;

    # Assign the valid struct to d
    d = &valid;

    # This should work
    printf("Value after reassignment: %d\n", d.value);
}

# Test copying nullptr between variables
frame testCopyNull() {
    printf("Test 4: Copy nullptr between variables\n");
    local d1: *Data = nullptr;
    local d2: *Data = d1; # Copy nullptr

    printf("Accessing d2...\n");
    local _val: int = d2.value; # Should trap
    printf("Should not reach here\n");
}

# Test nullptr in loop with reassignment
frame testLoopReassignment() {
    printf("Test 5: Loop with reassignment\n");
    local val: Data;
    local d: *Data = &val;
    d.value = 0;

    local i: int = 0;
    loop (i < 3) {
        printf("Iteration %d, value: %d\n", i, d.value);

        if (i == 1) {
            d = nullptr; # Set to nullptr on second iteration
            printf("Set to nullptr\n");
        }
        i = i + 1;

        # Next iteration will trap when accessing d.value if i was 1
    }

    printf("Loop completed\n");
}

frame main() ret int {
    printf("=== Nullptr Assignment Patterns Test ===\n\n");

    # Test 1: Valid then nullptr
    try {
        testValidThenNull();
        printf("ERROR: Should have thrown!\n");
    } catch (e: NullAccessError) {
        printf("Caught Test 1: %s in %s (expr: %s)\n", e.message, e.function, e.expression);
    }
    # Test 2: Conditional assignment with nullptr
    try {
        testConditionalAssignment(true);
        printf("ERROR: Should have thrown!\n");
    } catch (e: NullAccessError) {
        printf("Caught Test 2: %s in %s (expr: %s)\n", e.message, e.function, e.expression);
    }
    # Test 3: Nullptr to valid (should NOT throw)
    try {
        testNullToValid();
    } catch (e: NullAccessError) {
        printf("ERROR: Test 3 should not have thrown!\n");
    }
    # Test 4: Copy nullptr
    try {
        testCopyNull();
        printf("ERROR: Should have thrown!\n");
    } catch (e: NullAccessError) {
        printf("Caught Test 4: %s in %s (expr: %s)\n", e.message, e.function, e.expression);
    }
    # Test 5: Loop reassignment
    try {
        testLoopReassignment();
        printf("ERROR: Should have thrown!\n");
    } catch (e: NullAccessError) {
        printf("Caught Test 5: %s in %s (expr: %s)\n", e.message, e.function, e.expression);
    }
    printf("\nAll tests passed!\n");
    return 0;
}
