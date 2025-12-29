extern printf(fmt: string, ...);
extern malloc(size: int) ret *void;

frame main() ret int {
    local size: int = 5;
    local arr: *int = cast<*int>(malloc(size * cast<int>(sizeof(int))));

    local i: int = 0;
    loop (i < size) {
        *(arr + i) = 0;
        i = i + 1;
    }

    printf("%d\n", *arr);
    return 0;
}
