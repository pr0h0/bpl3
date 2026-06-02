import [NullAccessError] from "std/errors.bpl";
import [printf] from "std/c.bpl";

struct Point {
    x: int,
    y: int,
}

struct Counter {
    count: int,
}

# Test nullptr in arithmetic expressions
frame testArithmetic() {
    printf("Test 1: Nullptr in arithmetic\n");
    local p: *Point = nullptr;
    local _result: int = p.x + p.y; # Should trap on p.x
    printf("Should not reach here\n");
}

# Test nullptr in comparison
frame testComparison() {
    printf("Test 2: Nullptr in comparison\n");
    local p1: *Point = nullptr;
    local p2: Point;
    p2.x = 10;
    p2.y = 20;

    if (p1.x > p2.x) {
        # Should trap on p1.x
        printf("p1 is greater\n");
    }
    printf("Should not reach here\n");
}

# Test nullptr with compound assignment
frame testCompoundAssignment() {
    printf("Test 3: Nullptr with compound assignment\n");
    local c: *Counter = nullptr;
    c.count = c.count + 1; # Should trap on reading c.count
    printf("Should not reach here\n");
}

# Test nullptr in ternary operator
frame testTernary() {
    printf("Test 4: Nullptr in ternary\n");
    local p: *Point = nullptr;
    local _result: int = true ? p.x : 0; # Should trap evaluating p.x
    printf("Should not reach here\n");
}

# Test nullptr with increment
frame testIncrement() {
    printf("Test 5: Nullptr with increment\n");
    local c: *Counter = nullptr;
    ++c.count; # Should trap
    printf("Should not reach here\n");
}

# Test multiple nullptr accesses in one expression
frame testMultipleAccess() {
    printf("Test 6: Multiple accesses in expression\n");
    local p: *Point = nullptr;
    # Should trap on first access (p.x)
    local _result: int = (p.x * 2) + (p.y * 3);
    printf("Should not reach here\n");
}

# Test 7: Nullptr in nested function calls
frame getDouble(x: int) ret int {
    return x * 2;
}

frame testNestedCalls() {
    printf("Test 7: Nullptr in nested calls\n");
    local p: *Point = nullptr;
    local _result: int = getDouble(p.x); # Should trap evaluating p.x
    printf("Should not reach here\n");
}

frame main() ret int {
    printf("=== Nullptr Complex Expressions Test ===\n\n");

    # Test 1: Arithmetic
    try {
        testArithmetic();
        printf("ERROR: Should have thrown!\n");
    } catch (e: NullAccessError) {
        printf("Caught Test 1: %s in %s (expr: %s)\n", e.message, e.function, e.expression);
    }
    # Test 2: Comparison
    try {
        testComparison();
        printf("ERROR: Should have thrown!\n");
    } catch (e: NullAccessError) {
        printf("Caught Test 2: %s in %s (expr: %s)\n", e.message, e.function, e.expression);
    }
    # Test 3: Compound assignment
    try {
        testCompoundAssignment();
        printf("ERROR: Should have thrown!\n");
    } catch (e: NullAccessError) {
        printf("Caught Test 3: %s in %s (expr: %s)\n", e.message, e.function, e.expression);
    }
    # Test 4: Ternary
    try {
        testTernary();
        printf("ERROR: Should have thrown!\n");
    } catch (e: NullAccessError) {
        printf("Caught Test 4: %s in %s (expr: %s)\n", e.message, e.function, e.expression);
    }
    # Test 5: Increment
    try {
        testIncrement();
        printf("ERROR: Should have thrown!\n");
    } catch (e: NullAccessError) {
        printf("Caught Test 5: %s in %s (expr: %s)\n", e.message, e.function, e.expression);
    }
    # Test 6: Multiple accesses
    try {
        testMultipleAccess();
        printf("ERROR: Should have thrown!\n");
    } catch (e: NullAccessError) {
        printf("Caught Test 6: %s in %s (expr: %s)\n", e.message, e.function, e.expression);
    }
    # Test 7: Nested calls
    try {
        testNestedCalls();
        printf("ERROR: Should have thrown!\n");
    } catch (e: NullAccessError) {
        printf("Caught Test 7: %s in %s (expr: %s)\n", e.message, e.function, e.expression);
    }
    printf("\nAll tests passed!\n");
    return 0;
}
