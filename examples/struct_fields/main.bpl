import [printf] from "std/c.bpl";

struct Point {
    x: int,
    y: int,
}

frame main() ret int {
    local p: Point;
    p.x = 10;
    p.y = 20;
    printf("Point: (%d, %d)\n", p.x, p.y);
    return 0;
}
