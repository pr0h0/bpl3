extern printf(fmt: string, ...);

frame id<T>(x: T) ret T {
    return x;
}

frame main() ret int {
    # Should infer T=int
    local x: int = id<int>(20);
    printf("%d\n", x);
    return 0;
}
