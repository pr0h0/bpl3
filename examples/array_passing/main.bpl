extern printf(fmt: string, ...);

frame print_arr(arr: *int, size: int) {
    local i: int = 0;
    loop (i < size) {
        printf("%d ", *(arr + i));
        i = i + 1;
    }
    printf("\n");
}

frame main() ret int {
    local arr: int[3];
    arr[0] = 10;
    arr[1] = 20;
    arr[2] = 30;

    # Arrays decay to pointers? Or need explicit address?
    # Assuming explicit address of first element for safety
    print_arr(&arr[0], 3);
    return 0;
}
