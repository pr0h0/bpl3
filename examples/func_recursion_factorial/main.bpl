import [printf] from "std/c.bpl";

frame fact(n: int) ret int {
    if (n <= 1) {
        return 1;
    }
    return n * fact(n - 1);
}

frame main() ret int {
    printf("%d\n", fact(5));
    return 0;
}
