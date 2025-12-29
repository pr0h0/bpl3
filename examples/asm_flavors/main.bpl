extern printf(fmt: string, ...);

frame main() ret int {
    local x: int = 10;

    # Raw LLVM IR (default)
    asm("llvm") {
        %val_llvm = load i32, i32* (x)
        %val2_llvm = add i32 %val_llvm, 1
        store i32 %val2_llvm, i32* (x)
    }

    # x86 Assembly (AT&T syntax required for variables)
    # Note: Variables are substituted as registers (e.g. %0, %1)
    # Immediate values must be prefixed with $ (e.g. $1)
    asm("att") {
        movl $1, %eax
    }

    local y: int = 5;
    asm("att") {
        # (y) is substituted with a register holding the value of y
        movl (y), %eax
    }
    x = x + y;

    # Intel syntax (default for "x86")
    # Now supports variable interpolation!
    # Use (var) for value (input)
    # Use (&var) for pointer (address) to write to memory
    local z: int = 0;
    asm("intel") {
        # Load value of y into eax
        "mov eax, (y)"
        # Add 10
        "add eax, 10"
        # Store result into z (using pointer)
        "mov [(&z)], eax"
    }

    # z should be 15 (y=5 + 10)
    if (z != 15) {
        printf("Error: z is %d, expected 15\n", z);
        return 1;
    }
    printf("Value after all asm is: %d\n", x);
    return 0;
}
