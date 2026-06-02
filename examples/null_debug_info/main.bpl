import [NullAccessError] from "std/errors.bpl";
import [printf] from "std/c.bpl";

struct Point {
    x: int,
    y: int,
}

struct Container {
    items: int[5],
    count: int,
}

frame testMemberAccess() {
    local p: *Point = nullptr;

    printf("About to access p.x (should trap with error)...\n");
    local _val: int = p.x; # This will trap with detailed error message

    printf("This line should never execute\n");
}

frame testIndexAccess() {
    local c: *Container = nullptr;

    printf("About to access c.items[0] (should trap with error)...\n");
    local _val: int = c.items[0]; # This will trap with detailed error message

    printf("This line should never execute\n");
}

frame main() ret int {
    printf("=== Nullptr Object Debug Info Test ===\n\n");

    # Test 1: Member access
    try {
        testMemberAccess();
        printf("ERROR: Should have thrown!\n");
    } catch (e: NullAccessError) {
        printf("Caught Test 1: %s in %s (expr: %s)\n", e.message, e.function, e.expression);
    }
    # Test 2: Index access
    try {
        testIndexAccess();
        printf("ERROR: Should have thrown!\n");
    } catch (e: NullAccessError) {
        printf("Caught Test 2: %s in %s (expr: %s)\n", e.message, e.function, e.expression);
    }
    printf("\nAll tests passed!\n");
    return 0;
}
