extern printf(fmt: string, ...);

struct Point {
    x: int,
    y: int,
    frame new(x: int, y: int) ret Point {
        local p: Point;
        p.x = x;
        p.y = y;
        return p;
    }
}

frame main() ret int {
    local p: Point = Point.new(10, 20);
    printf("%d %d\n", p.x, p.y);
    return 0;
}
