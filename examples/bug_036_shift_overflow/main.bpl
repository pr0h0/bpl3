import [printf] from "std/c.bpl";

frame main() ret int {
    printf("sizeof(int) = %d\n", sizeof<int>());

    local x: int = 1;
    local shift: int = 65;
    local result: int = x << shift;
    printf("1 << 65 = %d\n", result);

    return 0;
}
