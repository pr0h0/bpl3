import [Error] from "std/errors.bpl";
import [printf] from "std/c.bpl";

struct Point {
    x: int,
    y: int,
}

frame main() ret int {
    # Test 1: Struct with all zeros should work
    printf("Test 1: Zero-valued struct\n");
    local p1: Point;
    p1.x = 0;
    p1.y = 0;
    printf("p1.x = %d, p1.y = %d\n", p1.x, p1.y);

    # Test 2: Normal struct works
    printf("\nTest 2: Normal struct\n");
    local p2: Point;
    p2.x = 10;
    p2.y = 20;
    printf("p2.x = %d, p2.y = %d\n", p2.x, p2.y);

    # Test 3: Nullptr struct traps
    printf("\nTest 3: Nullptr struct (should trap)\n");
    local p3: *Point = nullptr;
    printf("About to access p3.x...\n");

    try {
        local _val: int = p3.x; # Should trap here
        printf("ERROR: Should not reach here\n");
    } catch (e: NullAccessError) {
        printf("Caught: %s", e.message);
        printf(" in %s", e.function);
        printf(" (expr: %s)\n", e.expression);
    }
    # Test 4: Nullptr array access (should trap)
    printf("\nTest 4: Nullptr array access\n");
    local arr: *int = nullptr;
    try {
        local _val2: int = arr[0];
        printf("ERROR: Should not reach here\n");
    } catch (e: NullAccessError) {
        printf("Caught: %s", e.message);
        printf(" (expr: %s)\n", e.expression);
    }
    printf("\nAll tests passed!\n");
    return 0;
}
