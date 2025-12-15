# geometry.bpl - Geometric shapes and calculations
# Depends on: math_utils.bpl
import square from "./math_utils.bpl";
export [Point];
export [Circle];
export distanceSquared;
export circleArea;
struct Point {
    x: int,
    y: int,
}
struct Circle {
    center: Point,
    radius: int,
}
frame distanceSquared(p1: Point, p2: Point) ret int {
    local dx: int = p1.x - p2.x;
    local dy: int = p1.y - p2.y;
    return square(dx) + square(dy);
}
frame circleArea(c: Circle) ret int {
    # Approximation: PI * r^2 ≈ 3 * r^2
    return 3 * square(c.radius);
}
