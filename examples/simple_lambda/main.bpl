extern printf(fmt: string, ...);

frame main() ret int {
    local f: Lambda<int>(int) = |x: int| ret int {
        return x * 2;
    };
    printf("Result: %d\n", f(10));
    return 0;
}
