import [printf] from "std/c.bpl";

type Op = Func<int>(int, int);

frame add(a: int, b: int) ret int {
    return a + b;
}
frame sub(a: int, b: int) ret int {
    return a - b;
}

frame main() ret int {
    local ops: Func<int>(int, int)[2];
    ops[0] = add;
    ops[1] = sub;

    printf("%d\n", ops[0](10, 5));
    printf("%d\n", ops[1](10, 5));
    return 0;
}
