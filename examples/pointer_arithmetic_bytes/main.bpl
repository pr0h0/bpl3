extern printf(fmt: string, ...);

frame main() ret int {
    local x: int = 0x12345678;
    local p: *int = &x;
    local pb: *u8 = cast<*u8>(p);

    # Little endian usually
    # 78 56 34 12
    printf("%x\n", *pb);
    printf("%x\n", *(pb + 1));
    return 0;
}
