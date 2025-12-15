extern printf(fmt: *i8, ...) ret i32;
extern malloc(size: u64) ret *i8;
extern free(ptr: *i8) ret void;

frame main() ret i32 {
    printf("Multiple externs OK\n");
    return 0;
}
