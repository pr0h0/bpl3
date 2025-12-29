extern printf(fmt: string, ...);

struct Point {
    x: int,
    y: int,
}

frame print_point(p: Point) {
    printf("x=%d, y=%d\n", p.x, p.y);
    p.x = 100; # Should modify copy only
}

frame main() ret int {
    local p: Point;
    p.x = 10;
    p.y = 20;
    print_point(p);
    printf("Original x=%d\n", p.x);
    return 0;
}
