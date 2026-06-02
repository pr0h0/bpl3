import [printf] from "std/c.bpl";
# Test pointer manipulation and arithmetic edge cases
frame testPointerArithmetic() {
    printf("=== Pointer Arithmetic ===\n");
    local arr: int[10];
    local i: int = 0;
    # Initialize array
    loop (i < 10) {
        arr[i] = i * 10;
        i = i + 1;
    }
    # Use pointer arithmetic
    local ptr: *int = &arr[0];
    local offset: int = 0;
    loop (offset < 10) {
        local current: *int = ptr + offset;
        printf("arr[%d] = %d (via pointer+%d)\n", offset, *current, offset);
        offset = offset + 1;
    }
}
frame testPointerToPointer() {
    printf("\n=== Pointer to Pointer ===\n");
    local value: int = 42;
    local ptr1: *int = &value;
    local ptr2: *int = ptr1;
    printf("Original value: %d\n", value);
    printf("Via ptr1: %d\n", *ptr1);
    printf("Via ptr2: %d\n", *ptr2);
    *ptr1 = 100;
    printf("After *ptr1 = 100:\n");
    printf("Original value: %d\n", value);
    printf("Via ptr2: %d\n", *ptr2);
}
frame modifyThroughPointer(ptr: *int, new_val: int) {
    *ptr = new_val;
}
frame testPointerParameters() {
    printf("\n=== Pointer Parameters ===\n");
    local x: int = 10;
    local y: int = 20;
    printf("Before: x=%d, y=%d\n", x, y);
    modifyThroughPointer(&x, 99);
    modifyThroughPointer(&y, 88);
    printf("After: x=%d, y=%d\n", x, y);
}
frame main() ret int {
    testPointerArithmetic();
    testPointerToPointer();
    testPointerParameters();
    return 0;
}
