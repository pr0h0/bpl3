extern printf(fmt: *i8, ...) ret i32;

frame main() ret i32 {
    printf("Variadic extern test\n");
    return 0;
}
