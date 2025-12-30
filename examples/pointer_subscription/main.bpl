extern malloc(size: int) ret *void;
extern free(ptr: *void);
extern printf(fmt: string, ...);

frame main() ret int {
    local size: int = sizeof<int>() * 5;
    local arr: *int = cast<*int>(malloc(size));

    arr[0] = 10;
    arr[1] = 20;
    arr[2] = 30;

    printf("arr[0] = %d\n", arr[0]);
    printf("arr[1] = %d\n", arr[1]);
    printf("arr[2] = %d\n", arr[2]);

    free(cast<*void>(arr));
    return 0;
}
