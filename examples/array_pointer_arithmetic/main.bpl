extern printf(fmt: string, ...);

frame main() ret int {
    local arr: int[3];
    arr[0] = 10;
    arr[1] = 20;
    arr[2] = 30;

    local ptr: *int = &arr[0];
    printf("%d\n", *ptr);
    ptr = ptr + 1;
    printf("%d\n", *ptr);
    ptr = ptr + 1;
    printf("%d\n", *ptr);
    return 0;
}
