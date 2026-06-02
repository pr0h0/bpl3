import [printf] from "std/c.bpl";

frame main() ret int {
    local arr: int[5];
    arr[2] = 42;
    local i: int = 1;
    printf("%d\n", arr[i + 1]);
    return 0;
}
