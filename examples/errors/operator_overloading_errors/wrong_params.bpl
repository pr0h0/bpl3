# Error: Wrong parameter types for operator overload
# __add__ must take (this: *Type, other: Type) for binary operators

import [printf] from "std/c.bpl";

struct Point {
    x: int,
    y: int,
    # ERROR: Wrong signature - missing 'other' parameter
    frame __add__(this: *Point) ret Point {
        local result: Point = Point { x: this.x, y: this.y };
        return result;
    }
}

frame main() ret int {
    local p1: Point = Point { x: 1, y: 2 };
    local p2: Point = Point { x: 3, y: 4 };

    local p3: Point = p1 + p2; # Should error: wrong number of parameters

    return 0;
}
