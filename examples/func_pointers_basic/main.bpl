extern printf(fmt: string, ...);

type Op = Func<int>(int, int);

frame add(a: int, b: int) ret int {
    return a + b;
}
frame sub(a: int, b: int) ret int {
    return a - b;
}
frame mul(a: int, b: int) ret int {
    return a * b;
}

frame main() ret int {
    local op: Op = add;
    printf("%d\n", op(10, 5));
    op = sub;
    printf("%d\n", op(10, 5));

    local ops: Op[3];
    ops[0] = add;
    ops[1] = sub;
    ops[2] = mul;
    printf("%d\n", ops[0](7, 3));
    printf("%d\n", ops[1](7, 3));
    printf("%d\n", ops[2](7, 3));
    return 0;
}
