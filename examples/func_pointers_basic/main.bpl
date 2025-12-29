extern printf(fmt: string, ...);

type Op = Func<int>(int, int);

frame add(a: int, b: int) ret int {
    return a + b;
}
frame sub(a: int, b: int) ret int {
    return a - b;
}

frame main() ret int {
    local op: Op = add;
    printf("%d\n", op(10, 5));
    op = sub;
    printf("%d\n", op(10, 5));
    return 0;
}
