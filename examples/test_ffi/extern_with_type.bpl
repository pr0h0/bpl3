extern printf(fmt: *i8, ...) ret i32;

struct Point {
    x: i32,
    y: i32,
}

frame main() ret i32 {
    printf("Extern with type OK\n");
    return 0;
}
