extern printf(fmt: string, ...);

struct Data {
    info: (int, int),
}

frame main() ret int {
    local d: Data;
    d.info = (10, 20);
    local (a, b) = d.info;
    printf("%d %d\n", a, b);
    return 0;
}
