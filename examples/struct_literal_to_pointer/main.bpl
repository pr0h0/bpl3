extern printf(fmt: string, ...);

struct Point {
    x: int,
    y: int,
}

frame main() ret int {
    # This should now be allowed
    local p: *Point = Point { x: 5, y: 10 };

    printf("p.x: %d, p.y: %d\n", p.x, p.y);

    if ((p.x == 5) && (p.y == 10)) {
        printf("Success!\n");
        return 0;
    }
    return 1;
}
