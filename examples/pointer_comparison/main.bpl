import [printf] from "std/c.bpl";

frame main() ret int {
    local a: int = 1;
    local b: int = 2;
    local p1: *int = &a;
    local p2: *int = &a;
    local p3: *int = &b;

    if (p1 == p2) {
        printf("Equal\n");
    }
    if (p1 != p3) {
        printf("Not Equal\n");
    }
    return 0;
}
