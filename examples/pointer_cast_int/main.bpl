extern printf(fmt: string, ...);

frame main() ret int {
    local x: int = 10;
    local p: *int = &x;
    # Cast pointer to int (u64 usually for pointers)
    local addr: u64 = cast<u64>(p);

    if (addr > 0) {
        printf("Valid Address\n");
    }
    return 0;
}
