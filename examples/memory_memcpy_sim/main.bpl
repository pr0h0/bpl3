import [printf] from "std/c.bpl";

frame main() ret int {
    local src: int[3];
    src[0] = 1;
    src[1] = 2;
    src[2] = 3;

    local dst: int[3];

    local i: int = 0;
    loop (i < 3) {
        dst[i] = src[i];
        i = i + 1;
    }

    printf("%d %d %d\n", dst[0], dst[1], dst[2]);
    return 0;
}
