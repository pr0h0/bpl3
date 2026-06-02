import [printf] from "std/c.bpl";

struct X {
    y: int,
}

frame main() {
    printf("--- Test 1: NullAccessError triggering Defer ---\n");
    try {
        testNullAccessTrigger();
    } catch (e: NullAccessError) {
        printf("Caught NullAccessError in main\n");
    }
    printf("\n--- Test 2: Defer causing NullAccessError ---\n");
    try {
        testDeferCrash();
    } catch (e: NullAccessError) {
        printf("Caught NullAccessError from defer in main\n");
    }
    printf("\n--- Test 3: Return inside Defer ---\n");
    local res0: int = testReturnInDefer();
    printf("Result: %d\n", res0);

    printf("\n--- Test 4: Modifying Return Value (Primitive) ---\n");
    local x1: X;
    local res1: int = testPrimitiveUpdate(&x1);
    printf("Result: %d, x.y: %d\n", res1, x1.y);

    printf("\n--- Test 5: Modifying Return Value (Pointer) ---\n");
    local x2: X;
    local res2: *X = testPointerUpdate(&x2);
    printf("Result->y: %d\n", res2.y);
}

frame testNullAccessTrigger() {
    defer printf("Defer executed during NullAccess unwinding\n");
    printf("About to trigger NullAccessError\n");
    local p: *int = nullptr;
    local v: int = p[0]; # Should throw
    printf("Unreachable: %d\n", v);
}

frame testDeferCrash() {
    defer {
        printf("Defer running, about to crash\n");
        local p: *int = nullptr;
        local v: int = p[0]; # Should throw
        printf("Unreachable: %d\n", v);
    }
    printf("Function body finishing normally\n");
}

frame testReturnInDefer() ret int {
    defer {
        printf("Defer start\n");
        return; # Should exit defer lambda only
    }
    printf("Function body\n");
    return 1;
}

frame testPrimitiveUpdate(x: *X) ret int {
    defer {
        printf("Defer updating y to 5\n");
        x.y = 5;
    }
    x.y = 3;
    return x.y;
}

frame testPointerUpdate(x: *X) ret *X {
    defer {
        printf("Defer updating y to 10\n");
        x.y = 10;
    }
    x.y = 5;
    return x;
}
