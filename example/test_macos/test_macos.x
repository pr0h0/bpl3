# Simple test for macOS ARM64 compilation
# This test uses libc functions instead of raw syscalls

import printf, malloc, free from "std/libc.x";

frame main() ret i32 {
    call printf("Hello from BPL on macOS!\n");

    # Test basic arithmetic
    local x: i64 = 10;
    local y: i64 = 20;
    local sum: i64 = x + y;
    call printf("Sum of %d and %d is %d\n", x, y, sum);

    # Test memory allocation
    local ptr: *u8 = call malloc(100);
    if ptr != cast<*u8>(0) {
        call printf("Memory allocated successfully at %p\n", ptr);
        call free(ptr);
        call printf("Memory freed\n");
    }

    # Test loop
    local i: i64 = 0;
    call printf("Counting: ");
    loop {
        if i >= 5 {
            break;
        }
        call printf("%d ", i);
        i = i + 1;
    }
    call printf("\n");

    call printf("Test completed!\n");
    return 0;
}
