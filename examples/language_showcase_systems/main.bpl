import [free], [malloc], [printf], [strlen] from "std/c.bpl";

global cleanupTotal: int = 0;

struct Point {
    x: int,
    y: int,

    frame new(x: int, y: int) ret Point {
        local p: Point;
        p.x = x;
        p.y = y;
        return p;
    }

    frame move(this: *Point, dx: int, dy: int) {
        this.x += dx;
        this.y += dy;
    }

    frame sum(this: *Point) ret int {
        return this.x + this.y;
    }
}

struct DivideError {
    message: string,
}

frame rememberCleanup(value: int) {
    cleanupTotal += value;
}

frame runDeferCleanup() {
    defer rememberCleanup(5);
    defer rememberCleanup(10);
}

frame divide(a: int, b: int) ret int {
    if (b == 0) {
        throw DivideError { message: "divide by zero" };
    }
    return a / b;
}

frame main() ret int {
    local point: Point = Point.new(3, 5);
    point.move(5, 8);
    printf("point: (%d, %d)\n", point.x, point.y);
    printf("method sum: %d\n", point.sum());

    local heapValue: *int = cast<*int>(malloc(cast<long>(sizeof<int>())));
    *heapValue = 12 * 12;
    printf("heap value: %d\n", *heapValue);
    free(cast<*void>(heapValue));

    printf("ffi strlen: %d\n", strlen("systems"));
    printf("sizeof Point: %d\n", sizeof<Point>());

    try {
        local result: int = divide(10, 0);
        printf("unreachable: %d\n", result);
    } catch (error: DivideError) {
        printf("caught error: %s\n", error.message);
    }

    runDeferCleanup();
    printf("defer cleanup: %d\n", cleanupTotal);

    return 0;
}
