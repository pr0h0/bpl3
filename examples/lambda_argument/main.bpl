extern printf(fmt: string, ...);

type IntOp = Lambda<int>(int, int);

frame apply(op: IntOp, a: int, b: int) ret int {
    return op(a, b);
}

frame main() ret int {
    local res: int = apply(|a: int, b: int| ret int {
        return a - b;
    }, 10, 3);
    printf("Result: %d\n", res);
    return 0;
}
