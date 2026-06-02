import [printf] from "std/c.bpl";

type Op = Func<int>(int, int);

frame apply(f: Op, a: int, b: int) ret int {
    return f(a, b);
}

frame mul(a: int, b: int) ret int {
    return a * b;
}

frame main() ret int {
    printf("%d\n", apply(mul, 6, 7));
    return 0;
}
