import [printf] from "std/c.bpl";

struct Point {
    x: int,
    y: int,
}

frame main() ret int {
    local p: *Point = nullptr;

    printf("Testing nullptr object access trap...\n");
    printf("Attempting to access p.x on nullptr object:\n");

    # This will trap with an error message
    local _val: int = p.x;

    printf("This should not print\n");
    return 0;
}
