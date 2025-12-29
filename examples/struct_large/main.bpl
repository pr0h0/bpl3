extern printf(fmt: string, ...);

struct Large {
    a: int,
    b: int,
    c: int,
    d: int,
    e: int,
    f: int,
    g: int,
    h: int,
}

frame main() ret int {
    local l: Large;
    l.h = 100;
    printf("%d\n", l.h);
    return 0;
}
