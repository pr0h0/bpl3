extern printf(fmt: string, ...);
extern malloc(size: int) ret *void;
extern free(ptr: *void);

struct Point {
    x: int,
    y: int,
}

frame make_point_ptr(x: int, y: int) ret *Point {
    local p: *Point = cast<*Point>(malloc(sizeof(Point)));
    p.x = x;
    p.y = y;
    return p;
}

frame main() ret int {
    local p: *Point = make_point_ptr(5, 10);
    printf("x=%d, y=%d\n", p.x, p.y);
    free(cast<*void>(p));
    return 0;
}
