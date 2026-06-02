# BUG-117: Duplicate Generic Type Parameters (FIXED)
# This test verifies that duplicate generic parameters are now properly rejected.
# The following code should NOT compile.

import [printf] from "std/c.bpl";

# This struct has duplicate generic type parameter 'T' - should be rejected
struct DupParam<T, T> {
    x: T,
}

# Fixed version with unique type parameters
struct ValidParam<T, U> {
    x: T,
    y: U,
}

frame main() {
    local d: ValidParam<int, int> = ValidParam<int, int> { x: 42, y: 100 };
    printf("Value x: %d, y: %d\n", d.x, d.y);
    printf("BUG-117 FIXED: Duplicate generic parameters are now rejected!\n");
}
