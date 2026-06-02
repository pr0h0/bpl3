# Bug Hunt: Try-Catch Edge Cases
import [printf] from "std/c.bpl";

# Test 1: Nested try-catch
frame test_nested_try() {
    try {
        printf("Outer try\n");
        try {
            printf("Inner try\n");
            throw 42;
        } catch (e: int) {
            printf("Inner catch: %d\n", e);
            throw e * 2; # Rethrow modified
        }
    } catch (e: int) {
        printf("Outer catch: %d\n", e);
    }
}

# Test 2: Catch with different types
frame test_multi_type() {
    try {
        throw "error message";
    } catch (e: int) {
        printf("Caught int: %d\n", e);
    } catch (e: string) {
        printf("Caught string: %s\n", e);
    }
}

# Test 3: throw without catch
frame test_uncaught() {
    # This would crash/terminate
    # throw 123;
}

# Test 4: Catch struct
struct MyError {
    code: int,
    msg: string,
}

frame test_catch_struct() {
    try {
        local err: MyError = MyError { code: 404, msg: "Not Found" };
        throw err;
    } catch (e: MyError) {
        printf("Caught MyError: code=%d, msg=%s\n", e.code, e.msg);
    }
}

# Test 5: catch-all clause
frame test_catch_other() {
    try {
        throw 3.14; # Float, not caught by int
    } catch (e: int) {
        printf("Caught int\n");
    } catch {
        printf("Caught something else\n");
    }
}

# Test 6: Try block with return
frame test_try_return() ret int {
    try {
        return 42;
    } catch (e: int) {
        return -1;
    }
    # Unreachable?
    return 0;
}

# Test 7: Empty try block
frame test_empty_try() {
    try {
    } catch (e: int) {
        printf("Caught\n");
    }
}

# Test 8: Throwing in catch
frame test_throw_in_catch() {
    try {
        try {
            throw 1;
        } catch (e: int) {
            printf("First catch: %d\n", e);
            throw 2;
        }
    } catch (e: int) {
        printf("Outer catch: %d\n", e);
    }
}

frame main() {
    printf("=== Nested try ===\n");
    test_nested_try();

    printf("\n=== Multi-type catch ===\n");
    test_multi_type();

    printf("\n=== Catch struct ===\n");
    test_catch_struct();

    printf("\n=== Catch other ===\n");
    test_catch_other();

    printf("\n=== Try return ===\n");
    local result: int = test_try_return();
    printf("Result: %d\n", result);

    printf("\n=== Empty try ===\n");
    test_empty_try();

    printf("\n=== Throw in catch ===\n");
    test_throw_in_catch();

    printf("\nAll try-catch tests done\n");
}
