extern printf(fmt: *i8, ...) ret i32;
extern strlen(s: *i8) ret u64;

frame main() ret i32 {
    printf("FFI test passed: %d\n", strlen("Hello FFI"));
    return 0;
}
