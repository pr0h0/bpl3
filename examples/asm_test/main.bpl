import [printf] from "std/c.bpl";

frame main() ret int {
    local a: int = 10;
    local b: int = 20;
    local result: int = 0;

    # Test 1: Basic interpolation with output
    asm("intel") {
        mov eax, (a)
        add eax, (b)
        mov (=result), eax
    }
    printf("Result 1: %d\n", result);

    # Test 2: Explicit constraints
    asm("intel") {
        mov ebx, 100
        mov (=result: "={eax}"), ebx
    }
    printf("Result 2: %d\n", result);

    # Test 3: Clobbers
    # We use ebx and declare it as clobbered.
    # This ensures LLVM doesn't store anything important in ebx across this block.
    asm("intel") {
        mov ebx, 200
        mov (=result), ebx
        [ "ebx" ]
    }
    printf("Result 3: %d\n", result);

    return 0;
}
