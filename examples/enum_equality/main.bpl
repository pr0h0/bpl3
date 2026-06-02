# Test enum equality comparison

import [printf] from "std/c.bpl";

enum Color {
    Red,
    Green,
    Blue,
}

enum Point {
    At(int, int),
}

frame main() ret int {
    local c1: Color = Color.Red;
    local c2: Color = Color.Red;
    local c3: Color = Color.Blue;

    # Unit variant equality
    if (c1 == c2) {
        printf("c1 == c2: true\n");
    }
    if (c1 != c3) {
        printf("c1 != c3: true\n");
    }
    # Tuple variant equality
    local p1: Point = Point.At(10, 20);
    local p2: Point = Point.At(10, 20);
    local p3: Point = Point.At(15, 25);

    if (p1 == p2) {
        printf("p1 == p2: true\n");
    }
    if (p1 != p3) {
        printf("p1 != p3: true\n");
    }
    return 0;
}
