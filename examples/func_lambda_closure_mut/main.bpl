import [printf] from "std/c.bpl";

# A lambda captures by value, so assigning to the captured variable is
# rejected. Capture a pointer to change the original.
frame main() ret int {
    local x: int = 10;
    local xPtr: *int = &x;
    local f: Lambda<void>() = || ret void {
        *xPtr = *xPtr + 1;
    };
    f();
    f();
    printf("%d\n", x);
    return 0;
}
