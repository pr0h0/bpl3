extern printf(fmt: string, ...);

frame main() {
    local arr: int[5] = [10, 20, 30, 40, 50];
    local ptr1: *int = &arr[4];
    local ptr2: *int = &arr[1];

    # Pointer subtraction should give the number of elements between pointers
    local diff: int = cast<int>(ptr1 - ptr2);

    printf("ptr1 points to: %d\n", *ptr1);
    printf("ptr2 points to: %d\n", *ptr2);
    printf("Difference: %d elements\n", diff);

    # Expected: 3 elements (index 4 - index 1 = 3)
}
