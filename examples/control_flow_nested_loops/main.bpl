import [printf] from "std/c.bpl";

frame main() ret int {
    local i: int = 0;
    loop (i < 3) {
        local j: int = 0;
        loop (j < 3) {
            if (j == 1) {
                j = j + 1;
                continue;
            }
            printf("i=%d, j=%d\n", i, j);
            j = j + 1;
        }
        i = i + 1;
    }
    return 0;
}
