import [printf] from "std/c.bpl";

struct Point {
    x: int,
    y: int,
}

frame modify_point(p: *Point) {
    p.x = 100;
}

frame main() ret int {
    local p: Point;
    p.x = 10;
    modify_point(&p);
    printf("Modified x=%d\n", p.x);
    return 0;
}
