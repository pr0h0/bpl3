import [printf] from "std/c.bpl";
# Advanced pointer example showcasing pointer arithmetic and memory operations
frame swapPointers(a: *int, b: *int) {
    local temp: int = *a;
    *a = *b;
    *b = temp;
}
frame findMax(arr: *int, size: int) ret int {
    local max_val: int = *arr;
    local i: int = 1;
    loop (i < size) {
        local current: *int = arr + i;
        if (*current > max_val) {
            max_val = *current;
        }
        i = i + 1;
    }
    return max_val;
}
frame reverseArray(arr: *int, size: int) {
    local left: int = 0;
    local right: int = size - 1;
    loop (left < right) {
        local left_ptr: *int = arr + left;
        local right_ptr: *int = arr + right;
        swapPointers(left_ptr, right_ptr);
        left = left + 1;
        right = right - 1;
    }
}
frame printArray(arr: *int, size: int) {
    local i: int = 0;
    printf("[");
    loop (i < size) {
        local ptr: *int = arr + i;
        printf("%d", *ptr);
        if (i < (size - 1)) {
            printf(", ");
        }
        i = i + 1;
    }
    printf("]\n");
}
frame main() ret int {
    local arr: int[5];
    arr[0] = 10;
    arr[1] = 20;
    arr[2] = 30;
    arr[3] = 40;
    arr[4] = 50;
    printf("Original array: ");
    printArray(&arr[0], 5);
    local max_val: int = findMax(&arr[0], 5);
    printf("Maximum value: %d\n", max_val);
    reverseArray(&arr[0], 5);
    printf("Reversed array: ");
    printArray(&arr[0], 5);
    # Pointer swap example
    local x: int = 100;
    local y: int = 200;
    printf("\nBefore swap: x=%d, y=%d\n", x, y);
    swapPointers(&x, &y);
    printf("After swap: x=%d, y=%d\n", x, y);
    return 0;
}
