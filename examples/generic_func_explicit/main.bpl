extern printf(fmt: string, ...);

frame id<T>(x: T) ret T {
    return x;
}

frame main() ret int {
    local x: int = id<int>(10);
    printf("%d\n", x);
    return 0;
}
