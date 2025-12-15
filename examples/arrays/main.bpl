extern printf(fmt: string, ...);
frame main() ret int {
    local arr: int[5];
    arr[0] = 10;
    arr[1] = 20;
    arr[2] = 30;
    arr[3] = 40;
    arr[4] = 50;
    local i: int = 0;
    loop (i < 5) {
        printf("%d ", arr[i]);
        i = i + 1;
    }
    printf("\n");
    return 0;
}
