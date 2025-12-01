import printf from "libc";

frame test_bitwise_u64() {
    call printf("--- Bitwise u64 ---\n");
    local a: u64 = 0xDEADBEEFCAFEBABE;
    local b: u64 = 0x00000000FFFFFFFF;

    local and_res: u64 = a & b;
    call printf("AND: %lx & %lx = %lx\n", a, b, and_res);

    local or_res: u64 = a | b;
    call printf("OR: %lx | %lx = %lx\n", a, b, or_res);

    local xor_res: u64 = a ^ b;
    call printf("XOR: %lx ^ %lx = %lx\n", a, b, xor_res);

    local not_res: u64 = ~b;
    call printf("NOT: ~%lx = %lx\n", b, not_res);

    local shift_l: u64 = 1 << 4;
    call printf("SHL: 1 << 4 = %ld\n", shift_l);

    local shift_r: u64 = 16 >> 2;
    call printf("SHR: 16 >> 2 = %ld\n", shift_r);
}

frame test_bitwise_u32() {
    call printf("\n--- Bitwise u32 ---\n");
    local a: u32 = 0xAABBCCDD;
    local b: u32 = 0x0000FFFF;

    local and_res: u32 = a & b;
    call printf("AND: %x & %x = %x\n", a, b, and_res);

    local not_res: u32 = ~a;
    call printf("NOT: ~%x = %x\n", a, not_res);
}

frame test_bitwise_u8() {
    call printf("\n--- Bitwise u8 ---\n");
    local a: u8 = 0b10101010; # 0xAA
    local b: u8 = 0b00001111; # 0x0F

    local and_res: u8 = a & b;
    call printf("AND: %x & %x = %x\n", a, b, and_res);

    local or_res: u8 = a | b;
    call printf("OR: %x | %x = %x\n", a, b, or_res);
}

frame main() ret u64 {
    call test_bitwise_u64();
    call test_bitwise_u32();
    call test_bitwise_u8();
    return 0;
}
