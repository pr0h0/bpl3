import [printf] from "std/c.bpl";

frame main() ret int {
    local x: int = 10;
    local f: Lambda<Lambda<int>(int)>(int) = |y: int| ret Lambda<int>(int) {
        return |z: int| ret int {
            return x + y + z;
        };
    };
    local g: Lambda<int>(int) = f(20);
    printf("Result: %d\n", g(30));
    return 0;
}
