import print_hello from "./lib.bpl";

extern printf(fmt: *i8, ...) ret i32;

frame main() ret i32 {
    print_hello();
    printf("Multi-file extern OK\n");
    return 0;
}
