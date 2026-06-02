import [printf] from "std/c.bpl";

frame main() ret int {
    local a: int = 1;
    local b: int = 2;
    local ptrs: *int[2];
    ptrs[0] = &a;
    ptrs[1] = &b;

    printf("%d %d\n", *ptrs[0], *ptrs[1]);
    return 0;
}
