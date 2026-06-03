import [printf] from "std/c.bpl";

frame foo() ret *int {
    local x: int = 42;
    return &x; # Error: returning address of stack variable
}

frame main() {
    local ptr: *int = foo();
    # This accesses freed memory. It might work, print garbage, or crash.
    # The fix should be a compiler error preventing this pattern.
    printf("Val: %d\n", *ptr);
}
