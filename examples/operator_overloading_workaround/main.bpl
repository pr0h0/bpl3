# Test to verify TypeChecker accepts generic operator overloads
# This should compile successfully but we won't use the operator

import [printf] from "std/c.bpl";

struct Box<T> {
    val: T,
    # Define the operator method
    frame __add__(this: *Box<T>, other: T) ret Box<T> {
        local result: Box<T>;
        result.val = this.val + other;
        return result;
    }

    # Explicit method to work around codegen issue
    frame add(this: *Box<T>, other: T) ret Box<T> {
        local result: Box<T>;
        result.val = this.val + other;
        return result;
    }
}

frame main() ret int {
    local b: Box<int>;
    b.val = 10;

    # Use the explicit method instead of operator to avoid codegen issue
    local b2: Box<int> = b.add(5);

    printf("b.val = %d\n", b.val);
    printf("b2.val = %d\n", b2.val);
    printf("Success: Generic methods work!\n");

    return 0;
}
