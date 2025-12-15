extern printf(fmt: string, ...);
struct Point {
    x: int,
    y: int,
    frame print(this: Point) {
        printf("Point(%d, %d)\n", this.x, this.y);
    }
}
frame main() ret int {
    local p: Point = Point { x: 10, y: 20 };
    p.print();
    return 0;
}
