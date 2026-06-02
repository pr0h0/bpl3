import [printf] from "std/c.bpl";

frame main() ret int {
    local res: int = |x: int| ret int {
        return x * x;
    }(5);
    printf("%d\n", res);
    return 0;
}
