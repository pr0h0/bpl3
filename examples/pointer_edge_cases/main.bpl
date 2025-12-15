extern printf(fmt: string, ...);
# Test pointer manipulation and arithmetic edge cases
frame test_pointer_arithmetic() {
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
frame test_pointer_to_pointer() {
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
frame modify_through_pointer(ptr: *int, new_val: int) {
    *ptr = new_val;
}
frame test_pointer_parameters() {
    printf("\n=== Pointer Parameters ===\n");
    local x: int = 10;
    local y: int = 20;
    printf("Before: x=%d, y=%d\n", x, y);
    modify_through_pointer(&x, 99);
    modify_through_pointer(&y, 88);
    printf("After: x=%d, y=%d\n", x, y);
}
frame main() ret int {
    test_pointer_arithmetic();
    test_pointer_to_pointer();
    test_pointer_parameters();
    return 0;
}
