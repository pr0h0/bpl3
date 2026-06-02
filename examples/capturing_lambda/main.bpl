import [printf] from "std/c.bpl";

frame main() ret int {
    local y: int = 100;
    local f: Lambda<int>(int) = |x: int| ret int {
        return x + y;
    };
    printf("Result: %d\n", f(5));
    return 0;
}
