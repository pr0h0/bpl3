import [printf] from "std/c.bpl";

frame main() ret int {
    local x: int = 100;
    local p: *int = &x;
    local pp: **int = &p;

    printf("%d\n", **pp);
    return 0;
}
