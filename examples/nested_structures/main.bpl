extern printf(fmt: string, ...);
# Test nested structures and complex data layouts
struct Point {
    x: int,
    y: int,
}
struct Rectangle {
    top_left: Point,
    bottom_right: Point,
}
struct Color {
    r: int,
    g: int,
    b: int,
}
struct Shape {
    bounds: Rectangle,
    color: Color,
    id: int,
}
frame make_point(x: int, y: int) ret Point {
    local p: Point;
    p.x = x;
    p.y = y;
    return p;
}
frame make_rectangle(x1: int, y1: int, x2: int, y2: int) ret Rectangle {
    local r: Rectangle;
    r.top_left = make_point(x1, y1);
    r.bottom_right = make_point(x2, y2);
    return r;
}
frame rectangle_area(rect: Rectangle) ret int {
    local width: int = rect.bottom_right.x - rect.top_left.x;
    local height: int = rect.bottom_right.y - rect.top_left.y;
    return width * height;
}
frame main() ret int {
    printf("=== Nested Structures Test ===\n");
    # Create a point
    local p1: Point = make_point(10, 20);
    printf("Point: (%d, %d)\n", p1.x, p1.y);
    # Create a rectangle with nested points
    local rect: Rectangle = make_rectangle(0, 0, 100, 50);
    printf("Rectangle: (%d,%d) to (%d,%d)\n", rect.top_left.x, rect.top_left.y, rect.bottom_right.x, rect.bottom_right.y);
    local area: int = rectangle_area(rect);
    printf("Area: %d\n", area);
    # Create a colored shape
    local shape: Shape;
    shape.bounds = rect;
    shape.color.r = 255;
    shape.color.g = 128;
    shape.color.b = 0;
    shape.id = 42;
    printf("Shape ID: %d, Color: RGB(%d,%d,%d)\n", shape.id, shape.color.r, shape.color.g, shape.color.b);
    printf("Shape area: %d\n", rectangle_area(shape.bounds));
    return 0;
}
