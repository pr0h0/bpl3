# Error: Wrong return type for comparison operators
# Comparison operators must return bool

import [printf] from "std/c.bpl";

struct Point {
    x: int,
    y: int,
    # ERROR: __eq__ must return bool, not int
    frame __eq__(this: *Point, other: Point) ret int {
        if ((this.x == other.x) && (this.y == other.y)) {
            return 1;
        } else {
            return 0;
        }
    }
}

frame main() ret int {
    local p1: Point = Point { x: 1, y: 2 };
    local p2: Point = Point { x: 1, y: 2 };

    if (p1 == p2) {
        # Should error: wrong return type
        printf("Equal\n");
    }
    return 0;
}
