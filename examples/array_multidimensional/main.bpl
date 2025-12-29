extern printf(fmt: string, ...);

frame main() ret int {
    local arr: int[2][2];
    arr[0][0] = 1;
    arr[0][1] = 2;
    arr[1][0] = 3;
    arr[1][1] = 4;

    printf("%d %d %d %d\n", arr[0][0], arr[0][1], arr[1][0], arr[1][1]);
    return 0;
}
