import [NullAccessError] from "std/errors.bpl";
extern printf(fmt: string, ...);

struct Inner {
    value: int,
}

struct Outer {
    inner: Inner,
    data: int,
}

struct Node {
    next: *Node,
    value: int,
}

struct Container {
    items: int[10],
    count: int,
}

# Test 1: Nested struct member access on nullptr
frame testNestedAccess() {
    printf("Test 1: Nested member access on nullptr\n");
    local outer: *Outer = nullptr;
    local _val: int = outer.inner.value; # Should trap on outer.inner
    printf("Should not reach here\n");
}

# Test 2: Array access on nullptr struct
frame testArrayInStruct() {
    printf("Test 2: Array in nullptr struct\n");
    local c: *Container = nullptr;
    local _val: int = c.items[5]; # Should trap on c.items
    printf("Should not reach here\n");
}

# Test 3: Multiple nullptr objects in same function
frame testMultipleNulls() {
    printf("Test 3: Multiple nullptr objects\n");
    local a: *Outer = nullptr;
    local b: *Container = nullptr;

    # First access should trap
    local _x: int = a.data;

    # This should never execute
    local _y: int = b.count;
    printf("Should not reach here\n");
}

# Test 4: Nullptr check in loop
frame testNullInLoop() {
    printf("Test 4: Nullptr in loop\n");
    local outer: *Outer = nullptr;
    local i: int = 0;

    loop (i < 5) {
        local _val: int = outer.data; # Should trap on first iteration
        i = i + 1;
    }
    printf("Should not reach here\n");
}

# Test 5: Assignment then nullptr access
frame testAssignThenAccess() {
    printf("Test 5: Assign then access nullptr\n");
    local val: Outer;
    local outer: *Outer = &val;
    outer.data = 42; # Valid assignment

    # Now set to nullptr
    outer = nullptr;

    # This should trap
    local _val: int = outer.data;
    printf("Should not reach here\n");
}

# Test 6: Conditional with nullptr
frame testConditionalNull() {
    printf("Test 6: Conditional with nullptr\n");
    local outer: *Outer = nullptr;

    if (outer == nullptr) {
        printf("Correctly detected nullptr\n");
        # But accessing it should still trap
        local _val: int = outer.data;
    }
    printf("Should not reach here\n");
}

# Test 7: Array of structs
frame testStructArrayElement() {
    printf("Test 7: Struct array element\n");
    local arr: *Outer[3];
    arr[1] = nullptr;
    local _val: int = arr[1].data; # Should trap
    printf("Should not reach here\n");
}

# Test 8: Deep nested access
frame testDeepNested() {
    printf("Test 8: Deep nested access\n");
    local outer: *Outer = nullptr;
    # Even though we're accessing nested field, trap should happen on first nullptr access
    local _val: int = outer.inner.value;
    printf("Should not reach here\n");
}

frame main() ret int {
    printf("=== Nullptr Edge Cases Test ===\n\n");

    # Test 1: Nested member access
    try {
        testNestedAccess();
        printf("ERROR: Should have thrown!\n");
    } catch (e: NullAccessError) {
        printf("Caught Test 1: %s in %s (expr: %s)\n", e.message, e.function, e.expression);
    }
    # Test 2: Array in struct
    try {
        testArrayInStruct();
        printf("ERROR: Should have thrown!\n");
    } catch (e: NullAccessError) {
        printf("Caught Test 2: %s in %s (expr: %s)\n", e.message, e.function, e.expression);
    }
    # Test 3: Multiple nulls - only first should throw
    try {
        testMultipleNulls();
        printf("ERROR: Should have thrown!\n");
    } catch (e: NullAccessError) {
        printf("Caught Test 3: %s in %s (expr: %s)\n", e.message, e.function, e.expression);
    }
    # Test 4: Nullptr in loop
    try {
        testNullInLoop();
        printf("ERROR: Should have thrown!\n");
    } catch (e: NullAccessError) {
        printf("Caught Test 4: %s in %s (expr: %s)\n", e.message, e.function, e.expression);
    }
    # Test 5: Assign then access
    try {
        testAssignThenAccess();
        printf("ERROR: Should have thrown!\n");
    } catch (e: NullAccessError) {
        printf("Caught Test 5: %s in %s (expr: %s)\n", e.message, e.function, e.expression);
    }
    # Test 6: Conditional nullptr
    try {
        testConditionalNull();
        printf("ERROR: Should have thrown!\n");
    } catch (e: NullAccessError) {
        printf("Caught Test 6: %s in %s (expr: %s)\n", e.message, e.function, e.expression);
    }
    # Test 7: Struct array element
    try {
        testStructArrayElement();
        printf("ERROR: Should have thrown!\n");
    } catch (e: NullAccessError) {
        printf("Caught Test 7: %s in %s (expr: %s)\n", e.message, e.function, e.expression);
    }
    # Test 8: Deep nested
    try {
        testDeepNested();
        printf("ERROR: Should have thrown!\n");
    } catch (e: NullAccessError) {
        printf("Caught Test 8: %s in %s (expr: %s)\n", e.message, e.function, e.expression);
    }
    printf("\nAll tests passed!\n");
    return 0;
}
