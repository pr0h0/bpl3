extern printf(fmt: *i8, ...) ret i32;

struct Point {
    x: i32,
    y: i32,
}

extern process_point(p: Point) ret void;

frame main() ret i32 {
    local p: Point;
    p.x = 5;
    p.y = 10;
    process_point(p);
    printf("Struct param extern OK\n");
    return 0;
}
