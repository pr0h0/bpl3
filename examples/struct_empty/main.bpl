import [printf] from "std/c.bpl";

struct Empty {
}

frame main() ret int {
    local e: Empty;
    printf("Size: %d\n", sizeof(e)); # Usually 0 or 1
    return 0;
}
