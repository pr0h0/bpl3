# Error: Calling non-callable object
# Only objects with __call__ can be invoked as functions

import [printf] from "std/c.bpl";

struct Point {
    x: int,
    y: int,
}

frame main() ret int {
    local p: Point = Point { x: 1, y: 2 };

    # ERROR: Point doesn't have __call__ operator
    local result: int = p(5); # Should error: type 'Point' is not callable

    return 0;
}
