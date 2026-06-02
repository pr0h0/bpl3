import [printf] from "std/c.bpl";

struct Point {
    x: int,
    y: int,
}

frame make_point(x: int, y: int) ret Point {
    local p: Point;
    p.x = x;
    p.y = y;
    return p;
}

frame main() ret int {
    local p: Point = make_point(5, 10);
    printf("x=%d, y=%d\n", p.x, p.y);
    return 0;
}
