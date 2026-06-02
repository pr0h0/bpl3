import [printf] from "std/c.bpl";

frame sum_many(a: int, b: int, c: int, d: int, e: int, f: int) ret int {
    return a + b + c + d + e + f;
}

frame main() ret int {
    printf("%d\n", sum_many(1, 2, 3, 4, 5, 6));
    return 0;
}
