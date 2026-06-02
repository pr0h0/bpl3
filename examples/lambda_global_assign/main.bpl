import [printf] from "std/c.bpl";

frame add(a: int, b: int) ret int {
    return a + b;
}

frame main() ret int {
    local f: Func<int>(int, int) = add;
    local res: int = f(10, 20);
    printf("Result: %d\n", res);
    return 0;
}
