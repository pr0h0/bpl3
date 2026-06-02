import [printf] from "std/c.bpl";

type Op = Func<int>(int, int);

frame add(a: int, b: int) ret int {
    return a + b;
}
frame sub(a: int, b: int) ret int {
    return a - b;
}

frame get_op(mode: int) ret Op {
    if (mode == 0) {
        return add;
    }
    return sub;
}

frame main() ret int {
    local f: Op = get_op(0);
    printf("%d\n", f(10, 20));
    f = get_op(1);
    printf("%d\n", f(10, 20));
    return 0;
}
