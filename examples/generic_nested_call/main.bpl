extern printf(fmt: string, ...);

frame id<T>(x: T) ret T {
    return x;
}

frame main() ret int {
    # id(id(10))
    printf("%d\n", id<int>(id<int>(10)));
    return 0;
}
