extern printf(fmt: string, ...);

frame main() ret int {
    local result: int = 0;

    # Test 1: AT&T Syntax
    # AT&T uses source, destination order. Registers prefixed with %. Immediates with $.
    # We use explicit constraints to ensure correct register usage.
    local val: int = 42;
    asm("att") {
        movl (val), %eax
        movl %eax, (=result: "=r")
    }
    printf("AT&T Result: %d\n", result);

    # Test 2: LLVM IR (raw with interpolation)
    # We can access the pointer of 'result' using (result).
    asm("llvm") {
        %ptr = getelementptr i32, i32* (result), i32 0
        store i32 123, i32* %ptr
    }
    printf("LLVM Result: %d\n", result);

    return 0;
}
