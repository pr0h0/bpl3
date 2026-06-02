# Error: Non-existent operator being used
# Operator must have a corresponding overload method

import [printf] from "std/c.bpl";

struct Point {
    x: int,
    y: int,
    # Only __add__ is defined, no __mul__
    frame __add__(this: *Point, other: Point) ret Point {
        local result: Point = Point { x: this.x + other.x, y: this.y + other.y };
        return result;
    }
}

frame main() ret int {
    local p1: Point = Point { x: 1, y: 2 };
    local p2: Point = Point { x: 3, y: 4 };

    local p3: Point = p1 + p2; # OK: __add__ exists
    local p4: Point = p1 * p2; # ERROR: __mul__ not defined, and Point doesn't support multiplication

    return 0;
}
