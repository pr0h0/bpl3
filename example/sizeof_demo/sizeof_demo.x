import printf, malloc, free from "libc";

extern malloc(size: u64) ret *u8;
extern free(ptr: *u8);

frame main() ret i32 {
    # Demonstrate sizeof with different types
    call printf("sizeof(u8) = %llu\n", sizeof(u8));
    call printf("sizeof(u16) = %llu\n", sizeof(u16));
    call printf("sizeof(u32) = %llu\n", sizeof(u32));
    call printf("sizeof(u64) = %llu\n", sizeof(u64));
    call printf("sizeof(*u64) = %llu\n", sizeof(*u64));

    # Use sizeof to allocate array of 10 u32 elements
    local size: u64 = 10 * sizeof(u32);
    local arr: *u32 = cast<*u32>(call malloc(size));

    call printf("Allocated %llu bytes for 10 u32 elements\n", size);

    # Initialize and print
    arr[0] = 100;
    arr[9] = 900;
    call printf("arr[0] = %u, arr[9] = %u\n", arr[0], arr[9]);

    call free(cast<*u8>(arr));

    return 0;
}
