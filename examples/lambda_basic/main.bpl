extern printf(fmt: string, ...);

frame main() ret int {
    local f: Lambda<int>(int, int) = |a: int, b: int| ret int {
        return a * b;
    };

    local res: int = f(6, 7);
    printf("Result: %d\n", res);
    return 0;
}
