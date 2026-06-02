import [printf] from "std/c.bpl";

frame get_safe(arr: *int, size: int, idx: int) ret int {
    if ((idx < 0) || (idx >= size)) {
        return -1;
    }
    return *(arr + idx);
}

frame main() ret int {
    local arr: int[3];
    arr[0] = 10;
    printf("%d\n", get_safe(&arr[0], 3, 0));
    printf("%d\n", get_safe(&arr[0], 3, 5));
    return 0;
}
