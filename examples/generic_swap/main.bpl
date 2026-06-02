import [printf] from "std/c.bpl";

frame swap<T>(a: *T, b: *T) {
    local temp: T = *a;
    *a = *b;
    *b = temp;
}

frame main() ret int {
    local x: int = 1;
    local y: int = 2;
    swap<int>(&x, &y);
    printf("%d %d\n", x, y);
    return 0;
}
