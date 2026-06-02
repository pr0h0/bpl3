import [printf] from "std/c.bpl";

frame main() ret int {
    local arr: int[5];
    local i: int = 0;
    loop (i < 5) {
        arr[i] = i * 10;
        i = i + 1;
    }
    printf("%d\n", arr[3]);
    return 0;
}
