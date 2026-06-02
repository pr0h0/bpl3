import [printf] from "std/c.bpl";

struct Data {
    info: (int, int),
}

frame main() ret int {
    local d: Data;
    d.info = (10, 20);
    local (a: int, b: int) = d.info;
    printf("%d %d\n", a, b);
    return 0;
}
