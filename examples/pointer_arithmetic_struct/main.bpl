extern printf(fmt: string, ...);

struct Point {
    x: int,
    y: int,
}

frame main() ret int {
    local arr: Point[2];
    arr[0].x = 1;
    arr[1].x = 2;

    local ptr: *Point = &arr[0];
    printf("%d\n", ptr.x);
    ptr = ptr + 1;
    printf("%d\n", ptr.x);
    return 0;
}
