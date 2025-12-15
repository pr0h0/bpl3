extern printf(fmt: string, ...);
frame main() ret int {
    # Bitwise AND
    local a: int = 12; # 1100 in binary
    local b: int = 10; # 1010 in binary
    local andResult: int = a & b; # 1000 = 8
    printf("AND: %d & %d = %d\n", a, b, andResult);
    # Bitwise OR
    local orResult: int = a | b; # 1110 = 14
    printf("OR: %d | %d = %d\n", a, b, orResult);
    # Bitwise XOR
    local xorResult: int = a ^ b; # 0110 = 6
    printf("XOR: %d ^ %d = %d\n", a, b, xorResult);
    # Bitwise NOT
    local c: int = 5;
    local notResult: int = ~c;
    printf("NOT: ~%d = %d\n", c, notResult);
    # Left shift
    local d: int = 3; # 0011
    local leftShift: int = d << 2; # 1100 = 12
    printf("LEFT SHIFT: %d << 2 = %d\n", d, leftShift);
    # Right shift
    local e: int = 48; # 110000
    local rightShift: int = e >> 3; # 000110 = 6
    printf("RIGHT SHIFT: %d >> 3 = %d\n", e, rightShift);
    # Complex bitwise expression
    local complex: int = (a & b) | ((c << 1) ^ 3);
    printf("Complex: ((12 & 10) | (5 << 1)) ^ 3 = %d\n", complex);
    # Bitwise operations with masks
    local flags: int = 0;
    local FLAG_READ: int = 1; # 0001
    local FLAG_WRITE: int = 2; # 0010
    local FLAG_EXEC: int = 4; # 0100
    # Set flags
    flags = flags | FLAG_READ;
    flags = flags | FLAG_WRITE;
    printf("Flags after setting READ and WRITE: %d\n", flags);
    # Check if flag is set
    local hasRead: int = (flags & FLAG_READ) != 0;
    local hasExec: int = (flags & FLAG_EXEC) != 0;
    printf("Has READ flag: %d\n", hasRead);
    printf("Has EXEC flag: %d\n", hasExec);
    # Clear flag
    flags = flags & ~FLAG_READ;
    printf("Flags after clearing READ: %d\n", flags);
    # Toggle flag
    flags = flags ^ FLAG_EXEC;
    printf("Flags after toggling EXEC: %d\n", flags);
    return 0;
}
