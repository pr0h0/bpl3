import [printf] from "std/c.bpl";

frame main() ret int {
    local a: float = 1.0;
    local b: float = 2.0;
    if (a < b) {
        printf("Less\n");
    }
    if (b > a) {
        printf("Greater\n");
    }
    if (a != b) {
        printf("Not Equal\n");
    }
    return 0;
}
