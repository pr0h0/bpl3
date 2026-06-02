import [printf] from "std/c.bpl";

frame main() ret int {
    local p: *int = nullptr;
    if (p == nullptr) {
        printf("Null\n");
    }
    local x: int = 1;
    p = &x;
    if (p != nullptr) {
        printf("Not Null\n");
    }
    return 0;
}
