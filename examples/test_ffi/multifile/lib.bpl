extern printf(fmt: *i8, ...) ret i32;

frame print_hello() {
    printf("Hello from lib\n");
}

export print_hello;
