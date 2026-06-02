# Error: Static operator overload (not allowed)
# Operator overloads must be instance methods

import [printf] from "std/c.bpl";

struct Point {
    x: int,
    y: int,
    # ERROR: Operator overload cannot be static
    # Missing 'this' parameter makes it static
    frame __add__(a: Point, b: Point) ret Point {
        local result: Point = Point { x: a.x + b.x, y: a.y + b.y };
        return result;
    }
}

frame main() ret int {
    local p1: Point = Point { x: 1, y: 2 };
    local p2: Point = Point { x: 3, y: 4 };

    local p3: Point = p1 + p2; # Should error: operator overload must be instance method

    return 0;
}
