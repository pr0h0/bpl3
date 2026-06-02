import [printf] from "std/c.bpl";

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

    local end: *int = &arr[2];
    local distance: i64 = end - &arr[0];
    printf("distance=%ld\n", distance);

    ptr = ptr - 2;
    printf("rewind=%d\n", *ptr);
    return 0;
}
